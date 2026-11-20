/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Excerpt, ExcerptToken, ExcerptTokenKind } from "@microsoft/api-extractor-model";
import * as ts from "typescript";

/**
 * The type alias prefix that lets the TypeScript parser read a standalone type expression.
 */
const prefix = "type ExcerptType = ";

/**
 * Parse results keyed by excerpt, including `undefined` for excerpts that failed to parse.
 */
const parsedTypes = new WeakMap<Excerpt, ts.TypeNode | undefined>();

/**
 * Parses an API Extractor excerpt as a single TypeScript type.
 *
 * @remarks
 * TypeScript can produce a syntax tree even when it reports a syntax error.
 * Rejecting those trees prevents the inheritance resolver from treating a partial type as a base or type argument.
 *
 * @returns The parsed type node, or `undefined` if the excerpt does not parse as one complete type.
 */
export function parseType(excerpt: Excerpt): ts.TypeNode | undefined {
	if (!parsedTypes.has(excerpt)) {
		const file = ts.createSourceFile(
			"excerpt.ts",
			`${prefix}${excerpt.text}`,
			ts.ScriptTarget.Latest,
			true,
		);
		const [statement] = file.statements;

		// The parser records syntax diagnostics on the source file; getting them this way needs no program or type checker.
		const valid =
			"parseDiagnostics" in file &&
			Array.isArray(file.parseDiagnostics) &&
			file.parseDiagnostics.length === 0;
		parsedTypes.set(
			excerpt,
			valid && file.statements.length === 1 && ts.isTypeAliasDeclaration(statement)
				? statement.type
				: undefined,
		);
	}
	return parsedTypes.get(excerpt);
}

/**
 * Creates an excerpt spanning the entire token list.
 */
export function asExcerpt(tokens: ExcerptToken[]): Excerpt {
	return new Excerpt(tokens, { startIndex: 0, endIndex: tokens.length });
}

/**
 * Creates an excerpt token containing plain text rather than a declaration reference.
 */
export function plainToken(text: string): ExcerptToken {
	return new ExcerptToken(ExcerptTokenKind.Content, text);
}

/**
 * Extracts the excerpt tokens covered by a TypeScript source range.
 *
 * @remarks
 * The parser measures positions from the start of the synthetic type alias, not from the start of the excerpt.
 * If the range cuts through a token, the slice retains the token's declaration reference so the text still links to the same target.
 *
 * @param excerpt - The excerpt used to construct the parsed type alias.
 * @param start - The first source position to include.
 * @param end - The first source position to exclude.
 */
function sliceTokens(excerpt: Excerpt, start: number, end: number): ExcerptToken[] {
	const tokens: ExcerptToken[] = [];
	if (start === end) {
		return tokens;
	}
	let offset = prefix.length;
	for (const token of excerpt.spannedTokens) {
		if (offset >= end) {
			break;
		}
		const next = offset + token.text.length;
		if (next > start) {
			tokens.push(
				start <= offset && next <= end
					? token
					: new ExcerptToken(
							token.kind,
							token.text.slice(Math.max(start - offset, 0), end - offset),
							token.canonicalReference,
						),
			);
		}
		offset = next;
	}
	return tokens;
}

/**
 * Looks up the canonical declaration reference for a parsed type name.
 *
 * @example
 * For `Collections.Box`, the lookup uses the token for `Box`, not the one for `Collections`.
 *
 * @returns The reference attached to the final identifier, or `undefined` if it has none.
 */
export function referenceForName(
	excerpt: Excerpt,
	name: ts.EntityName,
): ExcerptToken["canonicalReference"] {
	const identifier = ts.isQualifiedName(name) ? name.right : name;
	return sliceTokens(excerpt, identifier.getStart(), identifier.end).at(-1)
		?.canonicalReference;
}

/**
 * Extracts the outer type's declaration reference and type arguments from a named type expression.
 *
 * @remarks
 * The arguments remain separate excerpts so the caller can follow the base even when it cannot specialize every argument.
 *
 * @returns The base reference and argument excerpts, or `undefined` if the expression is not a named type or the name has no canonical reference.
 */
export function getNamedBase(excerpt: Excerpt):
	| {
			reference: NonNullable<ExcerptToken["canonicalReference"]>;
			typeArguments: Excerpt[];
	  }
	| undefined {
	let type = parseType(excerpt);
	while (type !== undefined && ts.isParenthesizedTypeNode(type)) {
		type = type.type;
	}
	if (type === undefined || !ts.isTypeReferenceNode(type)) {
		return undefined;
	}
	const reference = referenceForName(excerpt, type.typeName);
	return reference === undefined
		? undefined
		: {
				reference,
				typeArguments:
					type.typeArguments?.map((node) =>
						asExcerpt(sliceTokens(excerpt, node.getStart(), node.end)),
					) ?? [],
			};
}

/**
 * A substitution of a type argument for one type occurrence in an excerpt.
 */
export interface TypeReplacement {
	/**
	 * The source node whose span is replaced.
	 */
	readonly node: ts.TypeNode;

	/**
	 * The argument excerpt to insert in place of the node.
	 */
	readonly replacement: Excerpt;

	/**
	 * Whether to enclose the argument in parentheses to preserve operator precedence.
	 */
	readonly group: boolean;
}

/**
 * Applies type substitutions to an excerpt.
 *
 * @remarks
 * Text outside the replaced spans keeps its spelling and links. Inserted arguments keep their own declaration links.
 *
 * @param excerpt - The original excerpt from which the nodes in `edits` were parsed.
 * @param edits - Non-overlapping replacements in source order.
 */
export function replaceTypes(excerpt: Excerpt, edits: readonly TypeReplacement[]): Excerpt {
	if (edits.length === 0) {
		return excerpt;
	}

	const result: ExcerptToken[] = [];
	let start = prefix.length;
	for (const { node, replacement, group } of edits) {
		result.push(...sliceTokens(excerpt, start, node.getStart()));
		if (group) {
			result.push(plainToken("("));
		}
		result.push(...replacement.spannedTokens);
		if (group) {
			result.push(plainToken(")"));
		}
		start = node.end;
	}
	result.push(...sliceTokens(excerpt, start, prefix.length + excerpt.text.length));
	return asExcerpt(result);
}
