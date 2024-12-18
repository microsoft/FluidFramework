/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type ApiItem, ApiItemKind, ReleaseTag } from "@microsoft/api-extractor-model";

import type { Heading } from "../Heading.js";
import type { Link } from "../Link.js";
import {
	getApiItemKind,
	getQualifiedApiItemName,
	getReleaseTag,
	getValueOrDerived,
	type ValidApiItemKind,
} from "../utilities/index.js";

import {
	FolderDocumentPlacement,
	HierarchyKind,
	type ApiItemTransformationConfiguration,
	type DocumentHierarchyConfig,
	type FolderHierarchyConfig,
	type HierarchyConfig,
	type HierarchyOptions,
} from "./configuration/index.js";

/**
 * This module contains `ApiItem`-related utilities for use in transformation logic.
 */

/**
 * API item paired with its hierarchy config.
 */
export interface ApiItemWithHierarchy<THierarchy extends HierarchyConfig = HierarchyConfig> {
	readonly apiItem: ApiItem;
	readonly hierarchy: THierarchy;
}

/**
 * Gets the nearest ancestor of the provided item that will have its own rendered document.
 *
 * @remarks
 * This can be useful for determining the file path the item will ultimately be rendered under,
 * as well as for generating links.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param hierarchyConfig - See {@link HierarchyOptions}
 */
function getFirstAncestorWithOwnDocument(
	apiItem: ApiItem,
	hierarchyConfig: Required<HierarchyOptions>,
): ApiItemWithHierarchy<DocumentHierarchyConfig | FolderHierarchyConfig> {
	// Walk parentage until we reach an item kind that gets rendered to its own document.
	// That is the document we will target with the generated link.
	let hierarchyItem: ApiItem = apiItem;
	while (!doesItemRequireOwnDocument(hierarchyItem, hierarchyConfig)) {
		const parent = getFilteredParent(hierarchyItem);
		if (parent === undefined) {
			throw new Error(
				`Walking hierarchy from "${apiItem.displayName}" does not converge on an item that is rendered ` +
					`to its own document.`,
			);
		}
		hierarchyItem = parent;
	}

	const hierarchyItemKind = getApiItemKind(hierarchyItem);
	const hierarchy = hierarchyConfig[hierarchyItemKind];
	assert(hierarchy.kind !== HierarchyKind.Section);

	return {
		apiItem: hierarchyItem,
		hierarchy,
	};
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
	let documentPath = getDocumentPathForApiItem(apiItem, config);

	// Omit "index" file name from path generated in links.
	// This can be considered an optimization in most cases, but some documentation systems also special-case
	// "index" files, so this can also prevent issues in some cases.
	if (documentPath === "index" || documentPath.endsWith("/index")) {
		documentPath = documentPath.slice(0, documentPath.length - "index".length);
	}

	// Don't bother with heading ID if we are linking to the root item of a document
	let headingPostfix = "";
	if (!doesItemRequireOwnDocument(apiItem, config.hierarchy)) {
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
	const { apiItem: targetDocumentItem, hierarchy: targetDocumentHierarchy } =
		getFirstAncestorWithOwnDocument(apiItem, config.hierarchy);

	const documentName = getValueOrDerived(
		targetDocumentHierarchy.documentName,
		targetDocumentItem,
	);

	const pathSegments: string[] = [];

	// For the document itself, if its item creates folder-wise hierarchy, we need to refer to the hierarchy config
	// to determine whether or not it should be placed inside or outside that folder.
	if (
		targetDocumentHierarchy.kind === HierarchyKind.Folder &&
		targetDocumentHierarchy.documentPlacement === FolderDocumentPlacement.Inside
	) {
		const folderName = getValueOrDerived(
			targetDocumentHierarchy.folderName,
			targetDocumentItem,
		);
		pathSegments.push(`${folderName}/${documentName}`);
	} else {
		pathSegments.push(documentName);
	}

	let currentItem: ApiItem | undefined = getFilteredParent(targetDocumentItem);
	while (currentItem !== undefined) {
		const currentItemKind = getApiItemKind(currentItem);
		const currentItemHierarchy = config.hierarchy[currentItemKind];
		// Push path segments for all folders in the hierarchy
		if (currentItemHierarchy.kind === HierarchyKind.Folder) {
			const folderName = getValueOrDerived(currentItemHierarchy.folderName, currentItem);
			pathSegments.push(folderName);
		}
		currentItem = getFilteredParent(currentItem);
	}

	// Hierarchy is built from the root down, so reverse the segments to get the correct file path ordering
	pathSegments.reverse();

	return pathSegments.join("/");
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
	const id = doesItemRequireOwnDocument(apiItem, config.hierarchy)
		? undefined
		: getHeadingIdForApiItem(apiItem, config);
	const title = getHeadingTextForApiItem(apiItem, config);

	return {
		title,
		id,
		level: headingLevel,
	};
}

function getHeadingTextForApiItem(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): string {
	const itemKind = getApiItemKind(apiItem);
	const hierarchy = config.hierarchy[itemKind];
	return getValueOrDerived(hierarchy.headingText, apiItem);
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
 * hierarchical information up to the ancestor item whose document the specified item will ultimately be rendered to.
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
	const apiItemKind: ApiItemKind = apiItem.kind;

	// Walk parentage up until we reach the ancestor into whose document we're being rendered.
	// Generate ID information for everything back to that point
	let hierarchyItem = apiItem;
	while (!doesItemRequireOwnDocument(hierarchyItem, config.hierarchy)) {
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
 * Gets the "filtered" parent of the provided API item.
 *
 * @remarks This logic specifically skips items of the following kinds:
 *
 * - EntryPoint: skipped because any given Package item will have exactly 1 EntryPoint child with current version of
 * API-Extractor, making this redundant in the hierarchy. We may need to revisit this in the future if/when
 * API-Extractor adds support for multiple entrypoints.
 *
 * @param apiItem - The API item whose filtered parent will be returned.
 */
export function getFilteredParent(apiItem: ApiItem): ApiItem | undefined {
	const parent = apiItem.parent;
	if (parent?.kind === ApiItemKind.EntryPoint) {
		return parent.parent;
	}
	return parent;
}

/**
 * Determines whether or not the specified API item is one that should be rendered to its own document
 * (as opposed to being rendered to a section under some ancestor item's document).
 *
 * @param apiItem - The API being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @public
 */
export function doesItemKindRequireOwnDocument(
	apiItemKind: ValidApiItemKind,
	hierarchyConfig: Required<HierarchyOptions>,
): boolean {
	const hierarchy = hierarchyConfig[apiItemKind];
	return hierarchy.kind !== HierarchyKind.Section;
}

/**
 * Determines whether or not the specified API item is one that should be rendered to its own document
 * (as opposed to being rendered to a section under some ancestor item's document).
 *
 * @param apiItem - The API being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function doesItemRequireOwnDocument(
	apiItem: ApiItem,
	hierarchyConfig: Required<HierarchyOptions>,
): boolean {
	const itemKind = getApiItemKind(apiItem);
	return doesItemKindRequireOwnDocument(itemKind, hierarchyConfig);
}

/**
 * Determines whether or not the specified API item should have documentation generated for it.
 * This is determined based on its release tag (or inherited release scope) compared to
 * {@link DocumentationSuiteOptions.minimumReleaseLevel}.
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
	config: Required<ApiItemTransformationConfiguration>,
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
 * {@link DocumentationSuiteOptions.minimumReleaseLevel}.
 * @param apiItem - The API item being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @public
 */
export function filterItems(
	apiItems: readonly ApiItem[],
	config: Required<ApiItemTransformationConfiguration>,
): ApiItem[] {
	return apiItems.filter((member) => shouldItemBeIncluded(member, config));
}

/**
 * Filters and returns the child members of the provided `apiItem` to include only those desired by the user configuration.
 * This is determined based on its release tag (or inherited release scope) compared to
 * {@link DocumentationSuiteOptions.minimumReleaseLevel}.
 * @remarks See {@link shouldItemBeIncluded} for more details.
 * @param apiItem - The API item being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function filterChildMembers(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): ApiItem[] {
	return filterItems(apiItem.members, config);
}
