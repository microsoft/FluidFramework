/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Excerpt,
	ExcerptToken,
	ExcerptTokenKind,
	type ApiMethod,
	type ApiMethodSignature,
	ApiPropertyItem,
} from "@microsoft/api-extractor-model";

import type { ApiTypeLike } from "../../utilities/index.js";

/**
 * Arguments for a declaration's own type parameters, expressed in the current type's scope.
 */
export type TypeBindings = ReadonlyMap<string, ExcerptToken | undefined>;

/**
 * The type to display; a fallback always uses the entire original declaration excerpt.
 */
export interface MemberType {
	readonly excerpt: Excerpt;
	readonly asDeclared: boolean;
}

/**
 * Matches a whole name such as `Box` or `Collections.Box`.
 *
 * @remarks
 * Checking the whole string keeps a type expression such as `Box | Other` from being mistaken for a single name.
 */
const qualifiedName =
	/^[$_\p{ID_Start}][$\p{ID_Continue}]*(?:\s*\.\s*[$_\p{ID_Start}][$\p{ID_Continue}]*)*$/u;

/**
 * Finds individual identifiers inside a type excerpt such as `Promise<T>`.
 *
 * @remarks
 * The resolver checks each match against the type parameter bindings before replacing it.
 */
const identifier = /[$_\p{ID_Start}][$\p{ID_Continue}]*/gu;

/**
 * Built-in type names and boolean literal types that can be used as type arguments without resolving a declaration.
 *
 * @example
 * `Box<string>` binds its parameter to `string` even though the excerpt has no reference to an API item for `string`.
 */
const intrinsicTypes = new Set([
	"any",
	"bigint",
	"boolean",
	"never",
	"null",
	"number",
	"object",
	"string",
	"symbol",
	"undefined",
	"unknown",
	"void",
	"true",
	"false",
]);

/**
 * Capture the reference at the end of a qualified name, without taking a reference
 * from another occurrence of the same name elsewhere in the excerpt.
 */
function nameToken(excerpt: Excerpt, text: string, end: number): ExcerptToken {
	let offset = 0;
	for (const token of excerpt.spannedTokens) {
		offset += token.text.length;
		if (token.canonicalReference !== undefined && offset === end) {
			return new ExcerptToken(ExcerptTokenKind.Reference, text, token.canonicalReference);
		}
	}
	return new ExcerptToken(ExcerptTokenKind.Content, text);
}

/**
 * Recognize the whole heritage expression.
 *
 * @example
 * `A<B>` refers to `A`, not `B`.
 */
export function getNamedBase(excerpt: Excerpt):
	| {
			reference: NonNullable<ExcerptToken["canonicalReference"]>;
			typeArguments: ExcerptToken[];
	  }
	| undefined {
	const [outer, ...lists] = excerpt.text.split("<");
	const name = outer.trim();
	if (!qualifiedName.test(name) || lists.length > 1) {
		return undefined;
	}
	const reference = nameToken(excerpt, name, outer.trimEnd().length).canonicalReference;
	if (reference === undefined) {
		return undefined;
	}
	const typeArguments: ExcerptToken[] = [];
	if (lists.length > 0) {
		const list = lists[0].trimEnd();
		if (!list.endsWith(">")) {
			return undefined;
		}
		let start = outer.length + 1;
		for (const part of list.slice(0, -1).split(",")) {
			const argument = part.trim();
			if (!qualifiedName.test(argument)) {
				return undefined;
			}
			typeArguments.push(nameToken(excerpt, argument, start + part.trimEnd().length));
			start += part.length + 1;
		}
	}
	return { reference, typeArguments };
}

/**
 * Bind supplied arguments in the derived scope and simple defaults in the base scope.
 */
export function bindBase(
	base: ApiTypeLike,
	supplied: readonly ExcerptToken[],
	derived: ApiTypeLike,
): TypeBindings {
	const bindings = new Map<string, ExcerptToken | undefined>();
	for (const [index, parameter] of base.typeParameters.entries()) {
		const argument = supplied[index];
		if (argument === undefined) {
			const excerpt = parameter.defaultTypeExcerpt;
			const name = excerpt.text.trim();
			if (qualifiedName.test(name)) {
				const token = nameToken(excerpt, name, excerpt.text.trimEnd().length);
				bindings.set(
					parameter.name,
					token.canonicalReference !== undefined || intrinsicTypes.has(name)
						? token
						: bindings.get(name),
				);
				continue;
			}
		} else if (
			argument.canonicalReference !== undefined ||
			intrinsicTypes.has(argument.text) ||
			derived.typeParameters.some((local) => local.name === argument.text)
		) {
			bindings.set(parameter.name, argument);
			continue;
		}
		bindings.set(parameter.name, undefined);
	}
	return bindings;
}

/**
 * Re-express a member's original bindings one edge closer to the derived type.
 */
export function rebind(
	bindings: TypeBindings,
	edge: TypeBindings,
	previous: TypeBindings | undefined,
): TypeBindings {
	const result = new Map<string, ExcerptToken | undefined>();
	for (const [name, argument] of bindings) {
		const next =
			argument !== undefined &&
			argument.canonicalReference === undefined &&
			edge.has(argument.text)
				? edge.get(argument.text)
				: argument;
		const other = previous?.get(name);

		// If paths in a diamond disagree, neither path is authoritative.
		result.set(
			name,
			previous === undefined ||
				(other?.text === next?.text &&
					other?.canonicalReference?.toString() === next?.canonicalReference?.toString())
				? next
				: undefined,
		);
	}
	return result;
}

/**
 * Resolve only type uses, never a method's own parameters or a nested binding such as `infer T`.
 */
export function getMemberType(
	member: ApiPropertyItem | ApiMethod | ApiMethodSignature,
	bindings: TypeBindings,
): MemberType {
	const excerpt =
		member instanceof ApiPropertyItem ? member.propertyTypeExcerpt : member.returnTypeExcerpt;
	if (bindings.size === 0) {
		return { excerpt, asDeclared: false };
	}
	const local =
		member instanceof ApiPropertyItem
			? []
			: member.typeParameters.map((parameter) => parameter.name);
	const original = { excerpt, asDeclared: false };
	const fallback = { excerpt, asDeclared: true };
	const tokens: ExcerptToken[] = [];
	let changed = false;
	for (const token of excerpt.spannedTokens) {
		let start = 0;
		if (token.canonicalReference === undefined) {
			for (const match of token.text.matchAll(identifier)) {
				const name = match[0];
				if (!bindings.has(name) || local.includes(name)) {
					continue;
				}
				const argument = bindings.get(name);

				// Restrict rewriting to type names, applications, arrays, tuples and unions/intersections.
				// In other syntax an identifier may be a property key, literal, or a fresh type parameter.
				if (
					argument === undefined ||
					/[^\p{ID_Continue}$\s<>,[\]()|&]/u.test(excerpt.text) ||
					/\b(?:infer|typeof|extends|new)\b/u.test(excerpt.text) ||
					(argument.canonicalReference === undefined && local.includes(argument.text))
				) {
					return fallback;
				}
				if (match.index > start) {
					tokens.push(
						new ExcerptToken(ExcerptTokenKind.Content, token.text.slice(start, match.index)),
					);
				}
				tokens.push(argument);
				start = match.index + name.length;
				changed = true;
			}
		}
		if (start === 0) {
			tokens.push(token);
		} else if (start < token.text.length) {
			tokens.push(new ExcerptToken(ExcerptTokenKind.Content, token.text.slice(start)));
		}
	}
	return changed
		? {
				excerpt: new Excerpt(tokens, { startIndex: 0, endIndex: tokens.length }),
				asDeclared: false,
			}
		: original;
}
