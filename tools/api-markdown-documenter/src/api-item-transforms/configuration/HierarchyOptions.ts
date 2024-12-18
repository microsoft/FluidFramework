/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApiDeclaredItem, type ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";

import {
	getQualifiedApiItemName,
	getFileSafeNameForApiItem,
	getSingleLineExcerptText,
	getApiItemKind,
	type ValidApiItemKind,
} from "../../utilities/index.js";

import { trimTrailingSemicolon } from "./Utilities.js";

/**
 * Kind of documentation suite hierarchy.
 *
 * @public
 */
export enum HierarchyKind {
	/**
	 * The API item gets a section under the document representing an ancestor of the API item.
	 */
	Section = "section",

	/**
	 * The API item gets its own document, in the folder for an ancestor of the API item.
	 */
	Document = "document",

	/**
	 * The API item gets its own document, and generates folder hierarchy for all descendent API items.
	 */
	Folder = "folder",
}

/**
 * {@link HierarchyConfig} base interface.
 *
 * @remarks
 * Not intended for external use.
 * Only exists to share common properties between hierarchy configuration types.
 *
 * @public
 */
export interface HierarchyConfigBase<THierarchyKind extends HierarchyKind> {
	/**
	 * {@inheritDoc HierarchyKind}
	 */
	readonly kind: THierarchyKind;
}

/**
 * {@link HierarchyKind.Section} hierarchy configuration options.
 *
 * @public
 */
export interface SectionHierarchyOptions {
	/**
	 * Heading text to use for the API item.
	 */
	readonly headingText: string | ((apiItem: ApiItem) => string);
}

/**
 * The corresponding API item will be placed in a section under the document representing an ancestor of the API item.
 *
 * @public
 */
export interface SectionHierarchyConfig
	extends HierarchyConfigBase<HierarchyKind.Section>,
		SectionHierarchyOptions {}

/**
 * {@link HierarchyKind.Document} hierarchy configuration options.
 *
 * @public
 */
export interface DocumentHierarchyOptions extends SectionHierarchyOptions {
	/**
	 * Document name to use for the API item.
	 */
	readonly documentName: string | ((apiItem: ApiItem) => string);
}

/**
 * The corresponding API item will get its own document, in the folder for an ancestor of the API item.
 *
 * @public
 */
export interface DocumentHierarchyConfig
	extends HierarchyConfigBase<HierarchyKind.Document>,
		DocumentHierarchyOptions {}

/**
 * Placement of the API item's document relative to its generated folder.
 *
 * @remarks Used by {@link FolderHierarchyOptions}.
 *
 * @public
 */
export enum FolderDocumentPlacement {
	/**
	 * The document is placed inside its folder.
	 */
	Inside = "inside",

	/**
	 * The document is placed outside (adjacent to) its folder.
	 */
	Outside = "outside",
}

/**
 * {@link HierarchyKind.Document} hierarchy configuration options.
 *
 * @public
 */
export interface FolderHierarchyOptions extends DocumentHierarchyOptions {
	/**
	 * Placement of the API item's document relative to its generated folder.
	 * `inside`: The document is placed inside its folder.
	 * `outside`: The document is placed outside (adjacent to) its folder.
	 */
	readonly documentPlacement:
		| FolderDocumentPlacement
		| ((apiItem: ApiItem) => FolderDocumentPlacement);

	/**
	 * Folder name to use for the API item.
	 */
	readonly folderName: string | ((apiItem: ApiItem) => string);
}

/**
 * The corresponding API item will get its own document, in the folder for an ancestor of the API item.
 *
 * @public
 */
export interface FolderHierarchyConfig
	extends HierarchyConfigBase<HierarchyKind.Folder>,
		FolderHierarchyOptions {}

/**
 * API item hierarchy configuration.
 *
 * @public
 */
export type HierarchyConfig =
	| SectionHierarchyConfig
	| DocumentHierarchyConfig
	| FolderHierarchyConfig;

/**
 * Default {@link SectionHierarchyOptions.headingText}.
 *
 * Uses the item's qualified API name, but is handled differently for the following items:
 *
 * - Model: Uses "index".
 *
 * - Package: Uses the unscoped package name.
 */
function defaultHeadingText(apiItem: ApiItem): string {
	const kind = getApiItemKind(apiItem);
	switch (kind) {
		case ApiItemKind.Model: {
			return "API Overview";
		}
		case ApiItemKind.CallSignature:
		case ApiItemKind.ConstructSignature:
		case ApiItemKind.IndexSignature: {
			// For signature items, the display-name is not particularly useful information
			// ("(constructor)", "(call)", etc.).
			// Instead, we will use a cleaned up variation on the type signature.
			const excerpt = getSingleLineExcerptText((apiItem as ApiDeclaredItem).excerpt);
			return trimTrailingSemicolon(excerpt);
		}
		default: {
			return apiItem.displayName;
		}
	}
}

const defaultSectionHierarchyConfig: SectionHierarchyConfig = {
	kind: HierarchyKind.Section,
	headingText: defaultHeadingText,
};

/**
 * Default {@link DocumentHierarchyOptions.documentName} for non-folder hierarchy documents.
 *
 * Uses the item's qualified API name, but is handled differently for the following items:
 *
 * - Package: Uses the unscoped package name.
 */
function defaultDocumentName(apiItem: ApiItem): string {
	const kind = getApiItemKind(apiItem);
	switch (kind) {
		case ApiItemKind.Package: {
			return getFileSafeNameForApiItem(apiItem);
		}
		default: {
			const base = getQualifiedApiItemName(apiItem);
			const postfix = apiItem.kind.toLocaleLowerCase();
			return `${base}-${postfix}`;
		}
	}
}

const defaultDocumentHierarchyConfig: DocumentHierarchyConfig = {
	kind: HierarchyKind.Document,
	headingText: defaultHeadingText,
	documentName: defaultDocumentName,
};

// Default folder name is the same as the default document name.
const defaultFolderName = defaultDocumentName;

const defaultFolderHierarchyConfig: FolderHierarchyConfig = {
	kind: HierarchyKind.Folder,
	headingText: defaultHeadingText,
	documentPlacement: FolderDocumentPlacement.Outside, // TODO
	documentName: defaultDocumentName,
	// documentName: "index", // Documents for items that get their own folder are always named "index" by default.
	folderName: defaultFolderName,
};

/**
 * Hierarchy options by API item kind.
 *
 * @public
 */
export type HierarchyOptions = {
	/**
	 * Hierarchy configuration for the API item kind.
	 */
	[Kind in Exclude<
		ValidApiItemKind,
		ApiItemKind.Model | ApiItemKind.EntryPoint | ApiItemKind.Package
	>]: HierarchyConfig;
} & {
	/**
	 * Hierarchy configuration for the `Model` API item kind.
	 *
	 * @remarks Always its own document. Never introduces folder hierarchy.
	 */
	[ApiItemKind.Model]: DocumentHierarchyConfig;

	/**
	 * Hierarchy configuration for the `Package` API item kind.
	 *
	 * @remarks Always introduces folder hierarchy.
	 * @privateRemarks TODO: Make this fully configurable - there is no real reason for this policy to be baked in.
	 */
	[ApiItemKind.Package]: FolderHierarchyConfig;

	/**
	 * Hierarchy configuration for the `EntryPoint` API item kind.
	 *
	 * @remarks Always its own document, adjacent to the package document.
	 * @privateRemarks TODO: Make this fully configurable - there is no real reason for this policy to be baked in.
	 */
	[ApiItemKind.EntryPoint]: DocumentHierarchyConfig;
};

/**
 * Default {@link HierarchyOptions}.
 */
export const defaultHierarchyOptions: HierarchyOptions = {
	[ApiItemKind.Model]: {
		kind: HierarchyKind.Document,
		headingText: "API Overview",
		documentName: "index",
	},

	// Items that introduce folder hierarchy:
	[ApiItemKind.Namespace]: defaultFolderHierarchyConfig,
	[ApiItemKind.Package]: defaultFolderHierarchyConfig,

	// Items that get their own document, but do not introduce folder hierarchy:
	[ApiItemKind.Class]: defaultDocumentHierarchyConfig,
	[ApiItemKind.Enum]: defaultSectionHierarchyConfig, // TODO: DocumentHierarchyConfig
	[ApiItemKind.EntryPoint]: defaultDocumentHierarchyConfig,
	[ApiItemKind.Interface]: defaultDocumentHierarchyConfig,
	[ApiItemKind.TypeAlias]: defaultSectionHierarchyConfig, // TODO: DocumentHierarchyConfig

	// Items that get a section under the document representing an ancestor of the API item:
	[ApiItemKind.CallSignature]: defaultSectionHierarchyConfig,
	[ApiItemKind.Constructor]: defaultSectionHierarchyConfig,
	[ApiItemKind.ConstructSignature]: defaultSectionHierarchyConfig,
	[ApiItemKind.EnumMember]: defaultSectionHierarchyConfig,
	[ApiItemKind.Function]: defaultSectionHierarchyConfig,
	[ApiItemKind.IndexSignature]: defaultSectionHierarchyConfig,
	[ApiItemKind.Method]: defaultSectionHierarchyConfig,
	[ApiItemKind.MethodSignature]: defaultSectionHierarchyConfig,
	[ApiItemKind.Property]: defaultSectionHierarchyConfig,
	[ApiItemKind.PropertySignature]: defaultSectionHierarchyConfig,
	[ApiItemKind.Variable]: defaultSectionHierarchyConfig,
};

/**
 * Gets a complete {@link HierarchyOptions} using the provided partial configuration, and filling
 * in the remainder with defaults.
 */
export function getHierarchyOptionsWithDefaults(
	inputOptions: Partial<HierarchyOptions> | undefined,
): HierarchyOptions {
	return { ...defaultHierarchyOptions, ...inputOptions };
}
