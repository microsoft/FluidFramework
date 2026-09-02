/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItemKind } from "@fluid-tools/api-markdown-documenter";
import {
	DocNodeKind,
	SelectorKind,
	TSDocParser,
	type DocLinkTag,
	type DocNode,
} from "@microsoft/tsdoc";

import type { ApiLinkManifest, ApiLinkManifestEntry } from "./apiLinkManifest";

/**
 * A TSDoc system selector supported by {@link ApiDeclarationReference} for distinguishing API item
 * kinds that share a name.
 *
 * @remarks
 * This is a website-specific subset of the selectors supported by
 * {@link https://tsdoc.org/pages/tags/link/ | TSDoc declaration references}.
 */
export type ApiKindSelector =
	| "class"
	| "enum"
	| "function"
	| "interface"
	| "namespace"
	| "type"
	| "variable";

/**
 * Characters that delimit identifiers in the supported declaration-reference grammar.
 */
type ApiReferenceDelimiter =
	| "."
	| ":"
	| "("
	| ")"
	| "#"
	| "~"
	| "!"
	| "@"
	| "{"
	| "}"
	| "["
	| "]"
	| '"'
	| "'"
	| "`"
	| " "
	| "\t"
	| "\n"
	| "\r";

/**
 * Evaluates whether a string is a non-empty, unquoted identifier in the supported grammar.
 */
type IsApiIdentifier<T extends string> = T extends ""
	? false
	: T extends `${string}${ApiReferenceDelimiter}${string}`
		? false
		: true;

/**
 * Evaluates whether a segment uses a supported TSDoc system selector.
 */
type IsKindSelectedSegment<T extends string> = T extends `(${infer Name}:${ApiKindSelector})`
	? IsApiIdentifier<Name>
	: false;

/**
 * Evaluates whether a segment is an identifier without a selector.
 */
type IsUnselectedSegment<T extends string> = IsApiIdentifier<T>;

/**
 * Evaluates whether a non-terminal segment is valid in the supported grammar.
 */
type IsNonTerminalSegment<T extends string> =
	IsUnselectedSegment<T> extends true ? true : IsKindSelectedSegment<T>;

/**
 * Evaluates whether a string represents a positive integer.
 */
type IsPositiveInteger<T extends string> = T extends `${bigint}`
	? T extends "0" | `-${string}`
		? false
		: true
	: false;

/**
 * Evaluates whether a terminal segment is an identifier, a kind-selected segment, or a segment
 * with a TSDoc numeric index selector.
 */
type IsTerminalSegment<T extends string> =
	IsNonTerminalSegment<T> extends true
		? true
		: T extends `(${infer Name}:${infer Selector})`
			? IsApiIdentifier<Name> extends true
				? IsPositiveInteger<Selector>
				: false
			: false;

/**
 * Recursively evaluates whether a literal string follows the supported declaration-reference grammar.
 */
type IsApiDeclarationReference<T extends string> = T extends `${infer Head}.${infer Tail}`
	? IsNonTerminalSegment<Head> extends true
		? IsApiDeclarationReference<Tail>
		: false
	: IsTerminalSegment<T>;

/**
 * The supported subset of a TSDoc declaration reference used by {@link ApiLink}.
 *
 * @remarks
 * Literal values are checked for dotted identifier paths, supported
 * {@link ApiKindSelector | kind selectors}, and a terminal positive numeric overload selector.
 * Dynamic strings are validated by the TSDoc parser at runtime. See
 * {@link https://tsdoc.org/pages/tags/link/ | TSDoc link-tag documentation} for the underlying
 * declaration-reference and selector syntax.
 */
export type ApiDeclarationReference<T extends string = string> = string extends T
	? string
	: IsApiDeclarationReference<T> extends true
		? T
		: never;

/**
 * One parsed member segment from a supported TSDoc declaration reference.
 */
interface ApiReferenceSegment {
	/**
	 * The member identifier without selector syntax.
	 */
	readonly name: string;

	/**
	 * The API item kind selected by a supported TSDoc system selector, when specified.
	 */
	readonly apiType?: ApiItemKind;

	/**
	 * The one-based overload selected by a terminal TSDoc numeric index selector, when specified.
	 */
	readonly overloadIndex?: number;
}

const apiTypeBySelector: Readonly<Partial<Record<string, ApiItemKind>>> = {
	class: "Class" as ApiItemKind,
	enum: "Enum" as ApiItemKind,
	function: "Function" as ApiItemKind,
	interface: "Interface" as ApiItemKind,
	namespace: "Namespace" as ApiItemKind,
	type: "TypeAlias" as ApiItemKind,
	variable: "Variable" as ApiItemKind,
};

const selectorByApiType = new Map<ApiItemKind, ApiKindSelector>([
	["Class" as ApiItemKind, "class"],
	["Enum" as ApiItemKind, "enum"],
	["Function" as ApiItemKind, "function"],
	["Interface" as ApiItemKind, "interface"],
	["Namespace" as ApiItemKind, "namespace"],
	["TypeAlias" as ApiItemKind, "type"],
	["Variable" as ApiItemKind, "variable"],
]);
const tsdocParser = new TSDocParser();

/**
 * The result of resolving an API declaration reference against a version's manifest.
 */
export interface ResolvedApiLink {
	/**
	 * The matching generated API documentation target.
	 */
	readonly target: ApiLinkManifestEntry;

	/**
	 * The declaration's dotted member path with selector syntax omitted.
	 */
	readonly defaultText: string;
}

/**
 * The result of trying to resolve an API declaration reference that is not documented.
 */
export interface UnresolvedApiLink {
	/**
	 * Indicates that the API declaration reference did not resolve.
	 */
	readonly found: false;

	/**
	 * The declaration's dotted member path with selector syntax omitted.
	 */
	readonly defaultText: string;
}

/**
 * The result of trying to resolve an API declaration reference.
 */
export type ApiLinkResolution = (ResolvedApiLink & { readonly found: true }) | UnresolvedApiLink;

/**
 * Resolves an API declaration reference from one version's API link manifest.
 */
export function resolveApiLinkTarget(
	manifest: Readonly<ApiLinkManifest>,
	packageName: string,
	api: string,
): ResolvedApiLink {
	const result = tryResolveApiLinkTarget(manifest, packageName, api);
	if (!result.found) {
		throw new Error(`No API documentation found for "${packageName}/${api}".`);
	}
	return { target: result.target, defaultText: result.defaultText };
}

/**
 * Tries to resolve an API declaration reference from one version's API link manifest.
 *
 * @remarks Parsing errors, unsupported selectors, and ambiguous references remain errors.
 */
export function tryResolveApiLinkTarget(
	manifest: Readonly<ApiLinkManifest>,
	packageName: string,
	api: string,
): ApiLinkResolution {
	const referencePath = parseApiReference(api);
	const apiName = referencePath.map((segment) => segment.name).join(".");
	const candidates = manifest[packageName]?.[apiName];
	if (candidates === undefined) {
		return { found: false, defaultText: apiName };
	}

	let matchingCandidates = candidates.filter((candidate) =>
		referencePath.every(
			(segment, index) =>
				segment.apiType === undefined || candidate.path[index]?.apiType === segment.apiType,
		),
	);
	if (matchingCandidates.length === 0) {
		return { found: false, defaultText: apiName };
	}

	const requestedOverload = referencePath.at(-1)?.overloadIndex;
	if (requestedOverload !== undefined) {
		matchingCandidates = matchingCandidates.filter(
			(candidate) => candidate.path.at(-1)?.overloadIndex === requestedOverload,
		);
		if (matchingCandidates.length === 0) {
			return { found: false, defaultText: apiName };
		}
	}

	for (const [index, referenceSegment] of referencePath.entries()) {
		const availableKinds = new Set(
			matchingCandidates
				.map((candidate) => candidate.path[index]?.apiType)
				.filter((apiType): apiType is ApiItemKind => apiType !== undefined),
		);
		if (availableKinds.size > 1) {
			const availableReferences = [...availableKinds]
				.map((apiType) => formatSelectedSegment(referenceSegment.name, apiType))
				.join(", ");
			throw new Error(
				`API segment "${referenceSegment.name}" in "${packageName}/${apiName}" is ambiguous. Specify a selector. Available segments: ${availableReferences}.`,
			);
		}
	}

	if (requestedOverload === undefined && matchingCandidates.length > 1) {
		const overloadOne = matchingCandidates.find(
			(candidate) => candidate.path.at(-1)?.overloadIndex === 1,
		);
		if (overloadOne !== undefined) {
			return { found: true, target: overloadOne, defaultText: apiName };
		}
	}

	const target = matchingCandidates[0];
	if (target === undefined) {
		return { found: false, defaultText: apiName };
	}
	return { found: true, target, defaultText: apiName };
}

function parseApiReference(api: string): readonly ApiReferenceSegment[] {
	const parserContext = tsdocParser.parseString(`/** {@link ${api} } */`);
	if (parserContext.log.messages.length > 0) {
		throw new Error(
			`Invalid API declaration reference "${api}": ${parserContext.log.messages.map((message) => message.unformattedText).join(" ")}`,
		);
	}

	const linkTags = findLinkTags(parserContext.docComment);
	const linkTag = linkTags[0];
	if (
		linkTags.length !== 1 ||
		linkTag?.codeDestination === undefined ||
		linkTag.linkText !== undefined ||
		linkTag.codeDestination.packageName !== undefined ||
		linkTag.codeDestination.importPath !== undefined ||
		linkTag.codeDestination.emitAsTsdoc() !== api
	) {
		throw new Error(`Invalid API declaration reference "${api}".`);
	}
	const declarationReference = linkTag.codeDestination;

	const memberReferences = declarationReference.memberReferences;
	if (memberReferences.length === 0) {
		throw new Error(`Invalid API declaration reference "${api}".`);
	}

	return memberReferences.map((memberReference, index) => {
		const identifier = memberReference.memberIdentifier;
		if (
			identifier === undefined ||
			identifier.hasQuotes ||
			memberReference.memberSymbol !== undefined ||
			memberReference.hasDot !== index > 0
		) {
			throw new Error(`Unsupported API declaration reference "${api}".`);
		}

		const selector = memberReference.selector;
		if (selector === undefined) {
			return { name: identifier.identifier };
		}

		if (selector.selectorKind === SelectorKind.System) {
			const apiType: ApiItemKind | undefined = apiTypeBySelector[selector.selector];
			if (apiType === undefined) {
				throw new Error(
					`Unsupported selector "${selector.selector}" in API declaration reference "${api}".`,
				);
			}
			return { name: identifier.identifier, apiType };
		}

		if (selector.selectorKind === SelectorKind.Index && index === memberReferences.length - 1) {
			return { name: identifier.identifier, overloadIndex: Number(selector.selector) };
		}

		throw new Error(
			`Unsupported selector "${selector.selector}" in API declaration reference "${api}".`,
		);
	});
}

function findLinkTags(root: DocNode): DocLinkTag[] {
	const linkTags: DocLinkTag[] = [];
	const visit = (node: DocNode): void => {
		if (node.kind === DocNodeKind.LinkTag) {
			linkTags.push(node as DocLinkTag);
		}
		for (const child of node.getChildNodes()) {
			visit(child);
		}
	};
	visit(root);
	return linkTags;
}

function formatSelectedSegment(name: string, apiType: ApiItemKind): string {
	const selector = selectorByApiType.get(apiType);
	return selector === undefined ? `${name} (${apiType})` : `(${name}:${selector})`;
}
