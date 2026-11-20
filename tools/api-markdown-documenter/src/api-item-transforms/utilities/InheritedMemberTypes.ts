/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiMethod,
	type ApiMethodSignature,
	ApiPropertyItem,
	type Excerpt,
} from "@microsoft/api-extractor-model";
import * as ts from "typescript";

import type { ApiTypeLike } from "../../utilities/index.js";

import {
	asExcerpt,
	parseType,
	plainToken,
	referenceForName,
	replaceTypes,
	type TypeReplacement,
} from "./TypeSyntax.js";

/**
 * Maps a declaration's type parameter names to argument excerpts in the current type's scope.
 *
 * @remarks
 * An `undefined` entry means the argument could not be resolved. Only members that use that parameter are affected.
 */
export type TypeBindings = ReadonlyMap<string, Excerpt | undefined>;

/**
 * The type information displayed in an inherited member's summary row.
 */
export interface MemberType {
	/**
	 * The property or return type excerpt to render.
	 */
	readonly excerpt: Excerpt;

	/**
	 * Whether to label the excerpt “(as declared)” because it could not be specialized.
	 */
	readonly asDeclared: boolean;
}

/**
 * Maps each of a declaration's type parameter names to an excerpt containing that name.
 *
 * @remarks
 * These bindings keep a parameter such as `T` in its declaring scope until a derived type supplies an argument.
 */
export function localBindings(item: ApiTypeLike): TypeBindings {
	return new Map(item.typeParameters.map(({ name }) => [name, asExcerpt([plainToken(name)])]));
}

/**
 * The TypeScript syntax kinds for built-in keyword types supported by the inheritance resolver.
 *
 * @remarks
 * A keyword such as `string` contains no type parameter to substitute, so the resolver preserves it as written.
 */
const keywordTypes = new Set([
	ts.SyntaxKind.AnyKeyword,
	ts.SyntaxKind.BigIntKeyword,
	ts.SyntaxKind.BooleanKeyword,
	ts.SyntaxKind.NeverKeyword,
	ts.SyntaxKind.NumberKeyword,
	ts.SyntaxKind.ObjectKeyword,
	ts.SyntaxKind.StringKeyword,
	ts.SyntaxKind.SymbolKeyword,
	ts.SyntaxKind.UndefinedKeyword,
	ts.SyntaxKind.UnknownKeyword,
	ts.SyntaxKind.VoidKeyword,
]);

/**
 * Identifies the type references in an expression and whether its syntax supports substitution.
 *
 * @remarks
 * References are collected in source order so replacements can preserve the surrounding text.
 * An expression that introduces a nested scope, such as `infer T`, is still inspected for references but is not rewritten.
 */
function inspectType(root: ts.TypeNode): {
	names: ts.TypeReferenceNode[];
	supported: boolean;
} {
	const names: ts.TypeReferenceNode[] = [];
	let supported = true;
	function visit(node: ts.Node): void {
		if (ts.isTypeReferenceNode(node)) {
			// In `Box<T>`, record `Box` before visiting `T` so substitutions can be applied in source order.
			names.push(node);
			for (const argument of node.typeArguments ?? []) {
				visit(argument);
			}
		} else if (ts.isArrayTypeNode(node)) {
			// Arrays, parentheses, tuples, unions, and intersections introduce no new type parameters.
			// Look inside them for uses of the enclosing declaration's parameters, such as `T` in `(T | string)[]`.
			visit(node.elementType);
		} else if (ts.isParenthesizedTypeNode(node)) {
			visit(node.type);
		} else if (ts.isTupleTypeNode(node)) {
			for (const element of node.elements) {
				visit(element);
			}
		} else if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
			for (const type of node.types) {
				visit(type);
			}
		} else if (!keywordTypes.has(node.kind) && !ts.isLiteralTypeNode(node)) {
			// Keywords and literals need no substitution. Other syntax may introduce its own `T`, as in `<T>() => T`.
			// Don't rewrite that expression, but still collect its names so an unrelated member type can be left unmarked.
			supported = false;
			ts.forEachChild(node, visit);
		}
	}
	visit(root);
	return { names, supported };
}

/**
 * Replaces free type parameters in an excerpt with their bound arguments.
 *
 * @remarks
 * A type argument must be understood in full because it may be substituted into another expression later.
 * A member type that needs no substitution can be displayed as written. References to declarations and a method's own type parameters are left intact.
 *
 * @returns The resulting excerpt, or `undefined` if the substitution cannot be made reliably.
 */
function substitute(
	excerpt: Excerpt,
	bindings: TypeBindings,
	mode: "argument" | "member",
	shadowed: readonly string[] = [],
): Excerpt | undefined {
	const root = parseType(excerpt);
	if (root === undefined) {
		return undefined;
	}
	const { names, supported } = inspectType(root);
	if (!supported && mode === "argument") {
		return undefined;
	}
	const edits: TypeReplacement[] = [];
	for (const node of names) {
		if (referenceForName(excerpt, node.typeName) !== undefined) {
			continue;
		}
		const name = node.typeName.getText();
		if (shadowed.includes(name)) {
			continue;
		}
		if (!bindings.has(name)) {
			if (mode === "argument") {
				return undefined;
			}
			continue;
		}
		const replacement = bindings.get(name);
		if (!supported || node.typeArguments !== undefined || replacement === undefined) {
			return undefined;
		}
		const replacementNode = parseType(replacement);
		if (
			replacementNode === undefined ||
			(shadowed.length > 0 &&
				inspectType(replacementNode).names.some((use) =>
					shadowed.includes(use.typeName.getText()),
				))
		) {
			return undefined;
		}

		// In an array or intersection, a substituted union may need parentheses: T[] -> (A | B)[].
		const group =
			(ts.isUnionTypeNode(replacementNode) &&
				(ts.isArrayTypeNode(node.parent) || ts.isIntersectionTypeNode(node.parent))) ||
			(ts.isIntersectionTypeNode(replacementNode) && ts.isArrayTypeNode(node.parent));
		edits.push({ node, replacement, group });
	}
	return replaceTypes(excerpt, edits);
}

/**
 * Binds a base declaration's type parameters to arguments in the derived type's scope.
 *
 * @remarks
 * Supplied arguments use names from the derived type. Defaults use names from the base declaration,
 * so a default such as `U = T` uses the argument already bound to `T`.
 */
export function bindBase(
	base: ApiTypeLike,
	supplied: readonly Excerpt[],
	derived: ApiTypeLike,
): TypeBindings {
	const bindings = new Map<string, Excerpt | undefined>();
	const locals = localBindings(derived);
	for (const [index, parameter] of base.typeParameters.entries()) {
		const argument = supplied[index];
		bindings.set(
			parameter.name,
			argument === undefined
				? substitute(parameter.defaultTypeExcerpt, bindings, "argument")
				: substitute(argument, locals, "argument"),
		);
	}
	return bindings;
}

/**
 * Determines whether two type argument excerpts have matching text and declaration references.
 *
 * @remarks
 * Identical names can refer to different declarations, so each reference must have the same target and span in both excerpts.
 * Differences in how API Extractor splits plain text into tokens do not affect the comparison.
 */
function sameArgument(left: Excerpt | undefined, right: Excerpt | undefined): boolean {
	if (left === right) {
		return true;
	}
	if (left === undefined || left.text !== right?.text) {
		return false;
	}
	function links(argument: Excerpt): string {
		let offset = 0;
		const targets: [number, number, string][] = [];
		for (const token of argument.spannedTokens) {
			if (token.canonicalReference !== undefined) {
				targets.push([offset, token.text.length, token.canonicalReference.toString()]);
			}
			offset += token.text.length;
		}
		return JSON.stringify(targets);
	}
	return links(left) === links(right);
}

/**
 * Translates a declaration's type argument bindings across one inheritance edge.
 *
 * @remarks
 * If another path has already reached the same declaration, the bindings from both paths must agree.
 * A conflicting argument is left unresolved so the displayed type does not depend on traversal order.
 */
export function rebind(
	bindings: TypeBindings,
	edge: TypeBindings,
	previous: TypeBindings | undefined,
): TypeBindings {
	const result = new Map<string, Excerpt | undefined>();
	for (const [name, argument] of bindings) {
		const next =
			argument === undefined || edge.size === 0
				? argument
				: substitute(argument, edge, "member");
		result.set(
			name,
			previous === undefined || sameArgument(previous.get(name), next) ? next : undefined,
		);
	}
	return result;
}

/**
 * Determines the property or return type to display for an inherited member.
 *
 * @remarks
 * If the type cannot be specialized reliably, the result uses the entire original excerpt and marks it as declared.
 */
export function getMemberType(
	member: ApiPropertyItem | ApiMethod | ApiMethodSignature,
	bindings: TypeBindings,
): MemberType {
	const original =
		member instanceof ApiPropertyItem ? member.propertyTypeExcerpt : member.returnTypeExcerpt;
	if (bindings.size === 0 || original.isEmpty) {
		return { excerpt: original, asDeclared: false };
	}
	const shadowed =
		member instanceof ApiPropertyItem ? [] : member.typeParameters.map(({ name }) => name);
	const excerpt = substitute(original, bindings, "member", shadowed);
	return { excerpt: excerpt ?? original, asDeclared: excerpt === undefined };
}
