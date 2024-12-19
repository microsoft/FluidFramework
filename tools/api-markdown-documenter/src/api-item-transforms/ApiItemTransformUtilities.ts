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
	getFilteredParent,
	getQualifiedApiItemName,
	getReleaseTag,
	getValueOrDerived,
	type ValidApiItemKind,
} from "../utilities/index.js";

import {
	FolderDocumentPlacement,
	HierarchyKind,
	type ApiItemTransformationConfiguration,
	type DocumentHierarchyConfiguration,
	type FolderHierarchyConfiguration,
	type DocumentationHierarchyConfiguration,
	type HierarchyConfiguration,
} from "./configuration/index.js";

/**
 * This module contains `ApiItem`-related utilities for use in transformation logic.
 */

/**
 * API item paired with its hierarchy config.
 */
export interface ApiItemWithHierarchy<
	THierarchy extends DocumentationHierarchyConfiguration = DocumentationHierarchyConfiguration,
> {
	readonly apiItem: ApiItem;
	readonly hierarchy: THierarchy;
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
	let documentPath = getDocumentPathForApiItem(apiItem, config.hierarchy);

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
 * Walks up the provided API item's hierarchy until and API item is found that matches the provided predicate.
 *
 * @returns The matching item, if one was found. Otherwise, `undefined`.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param predicate - A function that returns `true` when the desired item is found.
 */
function findInHierarchy(
	apiItem: ApiItem,
	predicate: (item: ApiItem) => boolean,
): ApiItem | undefined {
	let current: ApiItem | undefined = apiItem;
	do {
		if (predicate(current)) {
			return current;
		}
		current = getFilteredParent(current);
	} while (current !== undefined);

	return undefined;
}

/**
 * Gets the nearest ancestor of the provided item that will have its own rendered document.
 *
 * @remarks
 * This can be useful for determining the file path the item will ultimately be rendered under,
 * as well as for generating links.
 *
 * @param apiItem - The API item for which we are generating a file path.
 * @param hierarchyConfig - See {@link HierarchyConfiguration}
 */
function getFirstAncestorWithOwnDocument(
	apiItem: ApiItem,
	hierarchyConfig: Required<HierarchyConfiguration>,
): ApiItemWithHierarchy<DocumentHierarchyConfiguration | FolderHierarchyConfiguration> {
	// Walk parentage until we reach an item kind that gets rendered to its own document.
	// That is the document we will target with the generated link.
	const documentItem = findInHierarchy(apiItem, (item) =>
		doesItemRequireOwnDocument(item, hierarchyConfig),
	);

	if (documentItem === undefined) {
		throw new Error(
			`No ancestor of API item "${apiItem.displayName}" found that requires its own document.`,
		);
	}

	const documentItemKind = getApiItemKind(documentItem);
	const documentHierarchyConfig = hierarchyConfig[documentItemKind];
	assert(documentHierarchyConfig.kind !== HierarchyKind.Section);

	return {
		apiItem: documentItem,
		hierarchy: documentHierarchyConfig,
	};
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
 * @param hierarchyConfig - See {@link HierarchyConfiguration}.
 */
export function getDocumentPathForApiItem(
	apiItem: ApiItem,
	hierarchyConfig: HierarchyConfiguration,
): string {
	const targetDocument = getFirstAncestorWithOwnDocument(apiItem, hierarchyConfig);

	const documentName = getDocumentNameForItem(targetDocument, hierarchyConfig);

	const pathSegments: string[] = [];

	// For the document itself, if its item creates folder-wise hierarchy, we need to refer to the hierarchy config
	// to determine whether or not it should be placed inside or outside that folder.
	if (
		targetDocument.hierarchy.kind === HierarchyKind.Folder &&
		targetDocument.hierarchy.documentPlacement === FolderDocumentPlacement.Inside
	) {
		const folderName = getFolderNameForItem(
			targetDocument as ApiItemWithHierarchy<FolderHierarchyConfiguration>,
			hierarchyConfig,
		);
		pathSegments.push(`${folderName}/${documentName}`);
	} else {
		pathSegments.push(documentName);
	}

	let currentItem: ApiItem | undefined = getFilteredParent(targetDocument.apiItem);
	while (currentItem !== undefined) {
		const currentItemKind = getApiItemKind(currentItem);
		const currentItemHierarchy = hierarchyConfig[currentItemKind];
		// Push path segments for all folders in the hierarchy
		if (currentItemHierarchy.kind === HierarchyKind.Folder) {
			const folderName = getFolderNameForItem(
				{ apiItem: currentItem, hierarchy: currentItemHierarchy },
				hierarchyConfig,
			);
			pathSegments.push(folderName);
		}
		currentItem = getFilteredParent(currentItem);
	}

	// Hierarchy is built from the root down, so reverse the segments to get the correct file path ordering
	pathSegments.reverse();

	return pathSegments.join("/");
}

function getDocumentNameForItem(
	item: ApiItemWithHierarchy<DocumentHierarchyConfiguration | FolderHierarchyConfiguration>,
	hierarchyConfig: HierarchyConfiguration,
): string {
	return (
		getValueOrDerived(item.hierarchy.documentName, item.apiItem) ??
		createQualifiedDocumentNameForApiItem(item.apiItem, hierarchyConfig)
	);
}

function getFolderNameForItem(
	item: ApiItemWithHierarchy<FolderHierarchyConfiguration>,
	hierarchyConfig: HierarchyConfiguration,
): string {
	return (
		getValueOrDerived(item.hierarchy.folderName, item.apiItem) ??
		// If no folder name is configured, use the system-default document name
		createQualifiedDocumentNameForApiItem(item.apiItem, hierarchyConfig)
	);
}

function createQualifiedDocumentNameForApiItem(
	apiItem: ApiItem,
	hierarchyConfig: HierarchyConfiguration,
): string {
	const apiItemKind = getApiItemKind(apiItem);
	let documentName = getQualifiedApiItemName(apiItem);
	if (apiItemKind !== ApiItemKind.Package) {
		// If the item is not a package, append its "kind" to the document name to ensure uniqueness.
		// Packages strictly live at the root of the document hierarchy (beneath the model), and only
		// packages may appear there, so this information is redundant.
		const postfix = apiItemKind.toLocaleLowerCase();
		documentName = `${documentName}-${postfix}`;
	}

	// Walk up hierarchy until we find the nearest ancestor that yields folder hierarchy (or until we hit the model root).
	// Qualify the document name with all ancestral items up to that point to ensure document name uniqueness.

	let currentItem: ApiItem | undefined = getFilteredParent(apiItem);

	while (
		currentItem !== undefined &&
		currentItem.kind !== "Model" &&
		hierarchyConfig[getApiItemKind(currentItem)].kind !== HierarchyKind.Folder
	) {
		documentName = `${getQualifiedApiItemName(currentItem)}-${documentName}`;
		currentItem = getFilteredParent(currentItem);
	}

	return documentName;
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

// TODO: this doesn't actually return `undefined` for own document. Verify and fix.
/**
 * Generates a heading ID for the provided API item.
 * Guaranteed to be unique within the document to which the API item is being rendered.
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
	hierarchyConfig: Required<HierarchyConfiguration>,
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
	hierarchyConfig: Required<HierarchyConfiguration>,
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
