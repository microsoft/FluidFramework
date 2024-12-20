/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";

import { type ApiItem, ApiItemKind, ReleaseTag } from "@microsoft/api-extractor-model";

import type { Heading } from "../Heading.js";
import type { Link } from "../Link.js";
import {
	getQualifiedApiItemName,
	getReleaseTag,
	getApiItemKind,
	type ValidApiItemKind,
} from "../utilities/index.js";

import type {
	ApiItemTransformationConfiguration,
	DocumentBoundaries,
	HierarchyBoundaries,
} from "./configuration/index.js";

/**
 * This module contains `ApiItem`-related utilities for use in transformation logic.
 */

/**
 * Gets the nearest ancestor of the provided item that will have its own rendered document.
 *
 * @remarks
 * This can be useful for determining the file path the item will ultimately be rendered under,
 * as well as for generating links.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param documentBoundaries - See {@link DocumentBoundaries}
 */
function getFirstAncestorWithOwnDocument(
	apiItem: ApiItem,
	documentBoundaries: DocumentBoundaries,
): ApiItem {
	// Walk parentage until we reach an item kind that gets rendered to its own document.
	// That is the document we will target with the generated link.
	let hierarchyItem: ApiItem = apiItem;
	while (!doesItemRequireOwnDocument(hierarchyItem, documentBoundaries)) {
		const parent = getFilteredParent(hierarchyItem);
		if (parent === undefined) {
			throw new Error(
				`Walking hierarchy from "${apiItem.displayName}" does not converge on an item that is rendered ` +
					`to its own document.`,
			);
		}
		hierarchyItem = parent;
	}
	return hierarchyItem;
}

/**
 * Creates a {@link Link} for the provided API item.
 *
 * @remarks
 * If that item is one that will be rendered to a parent document, it will contain the necessary heading identifier
 * information to link to the appropriate heading.
 *
 * @param apiItem - The API item for which we are generating the link.
 * @param config - See {@link ApiItemTransformationConfiguration}
 * @param textOverride - Text to use in the link. If not provided, the default item name/signature will be used.
 *
 * @public
 */
export function getLinkForApiItem(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
	textOverride?: string,
): Link {
	const text = textOverride ?? config.getLinkTextForItem(apiItem);
	const url = getLinkUrlForApiItem(apiItem, config);
	return {
		text,
		target: url,
	};
}

/**
 * Creates a link URL to the specified API item.
 *
 * @remarks
 * If that item is one that will be rendered to a parent document, it will contain the necessary heading identifier
 * information to link to the appropriate heading.
 *
 * @param apiItem - The API item for which we are generating the link.
 * @param config - See {@link ApiItemTransformationConfiguration}
 */
function getLinkUrlForApiItem(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): string {
	const uriBase = config.getUriBaseOverrideForItem(apiItem) ?? config.uriRoot;
	let documentPath = getApiItemPath(apiItem, config).join("/");

	// Omit "index" file name from path generated in links.
	// This can be considered an optimization in most cases, but some documentation systems also special-case
	// "index" files, so this can also prevent issues in some cases.
	if (documentPath === "index" || documentPath.endsWith("/index")) {
		documentPath = documentPath.slice(0, documentPath.length - "index".length);
	}

	// Don't bother with heading ID if we are linking to the root item of a document
	let headingPostfix = "";
	if (!doesItemRequireOwnDocument(apiItem, config.documentBoundaries)) {
		const headingId = getHeadingIdForApiItem(apiItem, config);
		headingPostfix = `#${headingId}`;
	}

	return `${uriBase}/${documentPath}${headingPostfix}`;
}

/**
 * Gets the path to the document for the specified API item.
 *
 * @remarks
 *
 * In the case of an item that does not get rendered to its own document, this will point to the document
 * of the ancestor item under which the provided item will be rendered.
 *
 * The generated path is relative to {@link ApiItemTransformationConfiguration.uriRoot}.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function getDocumentPathForApiItem(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): string {
	const pathSegments = getApiItemPath(apiItem, config);
	return Path.join(...pathSegments);
}

/**
 * Gets the path to the specified API item, represented as an ordered list of path segments.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function getApiItemPath(apiItem: ApiItem, config: ApiItemTransformationConfiguration): string[] {
	const targetDocumentItem = getFirstAncestorWithOwnDocument(apiItem, config.documentBoundaries);

	const fileName = getDocumentNameForApiItem(apiItem, config);

	// Filtered ancestry in ascending order
	const documentAncestry = getAncestralHierarchy(targetDocumentItem, (hierarchyItem) =>
		doesItemGenerateHierarchy(hierarchyItem, config.hierarchyBoundaries),
	);

	return [
		fileName,
		...documentAncestry.map((hierarchyItem) =>
			getDocumentNameForApiItem(hierarchyItem, config),
		),
	].reverse();
}

/**
 * Gets the document name for the specified API item.
 *
 * @remarks
 *
 * In the case of an item that does not get rendered to its own document, this will be the file name for the document
 * of the ancestor item under which the provided item will be rendered.
 *
 * Note: This is strictly the name of the file, not a path to that file.
 * To get the path, use {@link getDocumentPathForApiItem}.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function getDocumentNameForApiItem(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): string {
	const targetDocumentItem = getFirstAncestorWithOwnDocument(apiItem, config.documentBoundaries);

	let unscopedFileName = config.getFileNameForItem(targetDocumentItem);

	// For items of kinds other than `Model` or `Package` (which are handled specially file-system-wise),
	// append the item kind to disambiguate file names resulting from members whose names may conflict in a
	// casing-agnostic context (e.g. type "Foo" and function "foo").
	if (
		targetDocumentItem.kind !== ApiItemKind.Model &&
		targetDocumentItem.kind !== ApiItemKind.Package
	) {
		unscopedFileName = `${unscopedFileName}-${targetDocumentItem.kind.toLocaleLowerCase()}`;
	}

	// Walk parentage up until we reach the first ancestor which injects directory hierarchy.
	// Qualify generated file name to ensure no conflicts within that directory.
	let hierarchyItem = getFilteredParent(targetDocumentItem);
	if (hierarchyItem === undefined) {
		// If there is no parent item, then we can just return the file name unmodified
		return unscopedFileName;
	}

	let scopedFileName = unscopedFileName;
	while (
		hierarchyItem.kind !== ApiItemKind.Model &&
		!doesItemGenerateHierarchy(hierarchyItem, config.hierarchyBoundaries)
	) {
		const segmentName = config.getFileNameForItem(hierarchyItem);
		if (segmentName.length === 0) {
			throw new Error("Segment name must be non-empty.");
		}

		scopedFileName = `${segmentName}-${scopedFileName}`;

		const parent = getFilteredParent(hierarchyItem);
		if (parent === undefined) {
			break;
		}
		hierarchyItem = parent;
	}

	return scopedFileName;
}

/**
 * Generates a {@link Heading} for the specified API item.
 *
 * @param apiItem - The API item for which the heading is being generated.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param headingLevel - Heading level to use.
 * If not specified, the heading level will be automatically generated based on the item's context in the resulting
 * document.
 *
 * @public
 */
export function getHeadingForApiItem(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
	headingLevel?: number,
): Heading {
	// Don't generate an ID for the root heading
	const id = doesItemRequireOwnDocument(apiItem, config.documentBoundaries)
		? undefined
		: getHeadingIdForApiItem(apiItem, config);

	return {
		title: config.getHeadingTextForItem(apiItem),
		id,
		level: headingLevel,
	};
}

/**
 * Generates a unique heading ID for the provided API item.
 *
 * @remarks
 * Notes:
 *
 * - If the item is one that will be rendered to its own document, this will return `undefined`.
 * Any links pointing to this item may simply link to the document; no heading ID is needed.
 *
 * - The resulting ID is context-dependent. In order to guarantee uniqueness, it will need to express
 * hierarchical information up to the ancester item whose document the specified item will ultimately be rendered to.
 *
 * @param apiItem - The API item for which the heading ID is being generated.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns A unique heading ID for the API item if one is needed. Otherwise, `undefined`.
 */
function getHeadingIdForApiItem(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): string {
	let baseName: string | undefined;
	const apiItemKind = getApiItemKind(apiItem);

	// Walk parentage up until we reach the ancestor into whose document we're being rendered.
	// Generate ID information for everything back to that point
	let hierarchyItem = apiItem;
	while (!doesItemRequireOwnDocument(hierarchyItem, config.documentBoundaries)) {
		const qualifiedName = getQualifiedApiItemName(hierarchyItem);

		// Since we're walking up the tree, we'll build the string from the end for simplicity
		baseName = baseName === undefined ? qualifiedName : `${qualifiedName}-${baseName}`;

		const parent = getFilteredParent(hierarchyItem);
		if (parent === undefined) {
			throw new Error(
				"Walking site hierarchy does not converge on an item that is rendered to its own document.",
			);
		}
		hierarchyItem = parent;
	}

	return `${baseName}-${apiItemKind.toLowerCase()}`;
}

/**
 * Gets the "filted" parent of the provided API item.
 *
 * @remarks This logic specifically skips items of the following kinds:
 *
 * - EntryPoint: skipped because any given Package item will have exactly 1 EntryPoint child with current version of
 * API-Extractor, making this redundant in the hierarchy. We may need to revisit this in the future if/when
 * API-Extractor adds support for multiple entrypoints.
 *
 * @param apiItem - The API item whose filtered parent will be returned.
 */
function getFilteredParent(apiItem: ApiItem): ApiItem | undefined {
	const parent = apiItem.parent;
	if (parent?.kind === ApiItemKind.EntryPoint) {
		return parent.parent;
	}
	return parent;
}

/**
 * Gets the ancestral hierarchy of the provided API item by walking up the parentage graph and emitting any items
 * matching the `includePredecate` until it reaches an item that matches the `breakPredecate`.
 *
 * @remarks Notes:
 *
 * - This will not include the provided item itself, even if it matches the `includePredecate`.
 *
 * - This will not include the item matching the `breakPredecate`, even if they match the `includePredecate`.
 *
 * @param apiItem - The API item whose ancestral hierarchy is being queried.
 * @param includePredecate - Predicate to determine which items in the hierarchy should be preserved in the
 * returned list. The provided API item will not be included in the output, even if it would be included by this.
 * @param breakPredicate - Predicate to determine when to break from the traversal and return.
 * The item matching this predicate will not be included, even if it would be included by `includePredicate`.
 *
 * @returns The list of matching ancestor items, provided in *ascending* order.
 */
export function getAncestralHierarchy(
	apiItem: ApiItem,
	includePredecate: (apiItem: ApiItem) => boolean,
	breakPredicate?: (apiItem: ApiItem) => boolean,
): ApiItem[] {
	const matches: ApiItem[] = [];

	let hierarchyItem: ApiItem | undefined = getFilteredParent(apiItem);
	while (
		hierarchyItem !== undefined &&
		(breakPredicate === undefined || !breakPredicate(hierarchyItem))
	) {
		if (includePredecate(hierarchyItem)) {
			matches.push(hierarchyItem);
		}
		hierarchyItem = getFilteredParent(hierarchyItem);
	}
	return matches;
}

/**
 * Determines whether or not the specified API item kind is one that should be rendered to its own document.
 *
 * @remarks This is essentially a wrapper around {@link DocumentationSuiteConfiguration.documentBoundaries}, but also enforces
 * system-wide invariants.
 *
 * Namely...
 *
 * - `Model` and `Package` items are *always* rendered to their own documents, regardless of the specified boundaries.
 *
 * - `EntryPoint` items are *never* rendered to their own documents (as they are completely ignored by this system),
 * regardless of the specified boundaries.
 *
 * @param kind - The kind of API item.
 * @param documentBoundaries - See {@link DocumentBoundaries}
 *
 * @returns `true` if the item should be rendered to its own document. `false` otherwise.
 */
export function doesItemKindRequireOwnDocument(
	kind: ValidApiItemKind,
	documentBoundaries: DocumentBoundaries,
): boolean {
	if (
		kind === ApiItemKind.EntryPoint ||
		kind === ApiItemKind.Model ||
		kind === ApiItemKind.Package
	) {
		return true;
	}
	return documentBoundaries.includes(kind);
}

/**
 * Determines whether or not the specified API item is one that should be rendered to its own document.
 *
 * @remarks
 *
 * This is essentially a wrapper around {@link DocumentationSuiteConfiguration.hierarchyBoundaries}, but also enforces
 * system-wide invariants.
 *
 * Namely...
 *
 * - `Package` items are *always* rendered to their own documents, regardless of the specified boundaries.
 *
 * - `EntryPoint` items are *never* rendered to their own documents (as they are completely ignored by this system),
 * regardless of the specified boundaries.
 *
 * @param apiItem - The API being queried.
 * @param documentBoundaries - See {@link DocumentBoundaries}
 *
 * @public
 */
export function doesItemRequireOwnDocument(
	apiItem: ApiItem,
	documentBoundaries: DocumentBoundaries,
): boolean {
	return doesItemKindRequireOwnDocument(getApiItemKind(apiItem), documentBoundaries);
}

/**
 * Determines whether or not the specified API item kind is one that should generate directory-wise hierarchy
 * in the resulting documentation suite.
 * I.e. whether or not child item documents should be generated under a sub-directory adjacent to the item in question.
 *
 * @remarks
 *
 * This is essentially a wrapper around {@link DocumentationSuiteConfiguration.hierarchyBoundaries}, but also enforces
 * system-wide invariants.
 *
 * Namely...
 *
 * - `Package` items are *always* rendered to their own documents, regardless of the specified boundaries.
 *
 * - `EntryPoint` items are *never* rendered to their own documents (as they are completely ignored by this system),
 * regardless of the specified boundaries.
 *
 * @param kind - The kind of API item.
 * @param hierarchyBoundaries - See {@link HierarchyBoundaries}
 *
 * @returns `true` if the item should contribute to directory-wise hierarchy in the output. `false` otherwise.
 */
function doesItemKindGenerateHierarchy(
	kind: ValidApiItemKind,
	hierarchyBoundaries: HierarchyBoundaries,
): boolean {
	if (kind === ApiItemKind.Model) {
		// Model items always yield a document, and never introduce hierarchy
		return false;
	}

	if (kind === ApiItemKind.Package) {
		return true;
	}
	if (kind === ApiItemKind.EntryPoint) {
		// The same API item within a package can be included in multiple entry-points, so it doesn't make sense to
		// include it in generated hierarchy.
		return false;
	}
	return hierarchyBoundaries.includes(kind);
}

/**
 * Determines whether or not the specified API item is one that should generate directory-wise hierarchy
 * in the resulting documentation suite.
 * I.e. whether or not child item documents should be generated under a sub-directory adjacent to the item in question.
 *
 * @remarks This is based on the item's `kind`. See {@link doesItemKindGenerateHierarchy}.
 *
 * @param apiItem - The API item being queried.
 * @param hierarchyBoundaries - See {@link HierarchyBoundaries}
 */
function doesItemGenerateHierarchy(
	apiItem: ApiItem,
	hierarchyBoundaries: HierarchyBoundaries,
): boolean {
	return doesItemKindGenerateHierarchy(getApiItemKind(apiItem), hierarchyBoundaries);
}

/**
 * Determines whether or not the specified API item should have documentation generated for it.
 * This is determined based on its release tag (or inherited release scope) compared to
 * {@link DocumentationSuiteConfiguration.minimumReleaseLevel}.
 *
 * @remarks
 *
 * If an item does not have its own release tag, it will inherit its release scope from its nearest ancestor.
 *
 * Items without an associated release tag (directly or in their ancestry) will always be included as a precaution.
 *
 * @param apiItem - The API item being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @example Hierarchical inheritance
 *
 * Items with tagged ancestors inherit their release scope when one is not specified.
 * This includes class/interface members...
 *
 * ```typescript
 * // @public
 * export interface Foo {
 * 	// `@public` inherited from the interface
 * 	bar: string;
 * }
 * ```
 *
 * This also includes scopes like namespaces, which can add further hierarchy...
 *
 * ```typescript
 * // @public
 * export namespace Foo {
 * 	// `@public` inherited from the namespace
 * 	export interface Bar {
 * 		// `@public` inherited from the namespace
 * 		baz: string;
 * 	}
 * }
 * ```
 *
 * @public
 */
export function shouldItemBeIncluded(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): boolean {
	const releaseTag = getReleaseTag(apiItem);
	if (releaseTag === undefined || releaseTag === ReleaseTag.None) {
		// If the item does not have a release tag, then it inherits the release scope of its ancestry.
		const parent = getFilteredParent(apiItem);
		if (parent === undefined) {
			// If we encounter an item with no release tag in its ancestry, we can't make a determination as to whether
			// or not it is intended to be included in the generated documentation suite.
			// To be safe, log a warning but return true.
			config.logger.warning("Encountered an API item with no release tag in ancestry.");
			return true;
		}

		return shouldItemBeIncluded(parent, config);
	}

	return releaseTag >= (config.minimumReleaseLevel as ReleaseTag);
}

/**
 * Filters and returns the provided list of `ApiItem`s to include only those desired by the user configuration.
 * This is determined based on its release tag (or inherited release scope) compared to
 * {@link DocumentationSuiteConfiguration.minimumReleaseLevel}.
 * @param apiItem - The API item being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @public
 */
export function filterItems(
	apiItems: readonly ApiItem[],
	config: ApiItemTransformationConfiguration,
): ApiItem[] {
	return apiItems.filter((member) => shouldItemBeIncluded(member, config));
}

/**
 * Filters and returns the child members of the provided `apiItem` to include only those desired by the user configuration.
 * This is determined based on its release tag (or inherited release scope) compared to
 * {@link DocumentationSuiteConfiguration.minimumReleaseLevel}.
 * @remarks See {@link shouldItemBeIncluded} for more details.
 * @param apiItem - The API item being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function filterChildMembers(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): ApiItem[] {
	return filterItems(apiItem.members, config);
}
