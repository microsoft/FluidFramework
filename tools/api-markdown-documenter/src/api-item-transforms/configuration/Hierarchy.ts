/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApiDeclaredItem, type ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";

import {
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
 * {@link DocumentationHierarchyConfiguration} base interface.
 *
 * @remarks
 * Not intended for external use.
 * Only exists to share common properties between hierarchy configuration types.
 *
 * @public
 */
export interface DocumentationHierarchyConfigurationBase<THierarchyKind extends HierarchyKind> {
	/**
	 * {@inheritDoc HierarchyKind}
	 */
	readonly kind: THierarchyKind;
}

/**
 * {@link HierarchyKind.Section} hierarchy configuration properties.
 *
 * @public
 */
export interface SectionHierarchyProperties {
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
export interface SectionHierarchyConfiguration
	extends DocumentationHierarchyConfigurationBase<HierarchyKind.Section>,
		SectionHierarchyProperties {}

/**
 * {@link HierarchyKind.Document} hierarchy configuration properties.
 *
 * @public
 */
export interface DocumentHierarchyProperties extends SectionHierarchyProperties {
	/**
	 * Document name to use for the API item.
	 * @remarks `undefined` indicates that the system default should be used.
	 */
	readonly documentName?: string | undefined | ((apiItem: ApiItem) => string | undefined);
}

/**
 * The corresponding API item will get its own document, in the folder for an ancestor of the API item.
 *
 * @public
 */
export interface DocumentHierarchyConfiguration
	extends DocumentationHierarchyConfigurationBase<HierarchyKind.Document>,
		DocumentHierarchyProperties {}

/**
 * Placement of the API item's document relative to its generated folder.
 *
 * @remarks Used by {@link FolderHierarchyProperties}.
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
 * {@link HierarchyKind.Document} hierarchy configuration properties.
 *
 * @public
 */
export interface FolderHierarchyProperties extends DocumentHierarchyProperties {
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
	 * @remarks `undefined` indicates that the system default should be used.
	 */
	readonly folderName: string | undefined | ((apiItem: ApiItem) => string | undefined);
}

/**
 * The corresponding API item will get its own document, in the folder for an ancestor of the API item.
 *
 * @public
 */
export interface FolderHierarchyConfiguration
	extends DocumentationHierarchyConfigurationBase<HierarchyKind.Folder>,
		FolderHierarchyProperties {}

/**
 * API item hierarchy configuration.
 *
 * @public
 */
export type DocumentationHierarchyConfiguration =
	| SectionHierarchyConfiguration
	| DocumentHierarchyConfiguration
	| FolderHierarchyConfiguration;

/**
 * Default {@link SectionHierarchyProperties.headingText}.
 *
 * Uses the item's qualified API name, but is handled differently for the following items:
 *
 * - CallSignature, ConstructSignature, IndexSignature: Uses a cleaned up variation on the type signature.
 *
 * - Model: Uses "API Overview".
 *
 * @privateRemarks Exported for testing purposes.
 */
export function defaultHeadingText(apiItem: ApiItem): string {
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

/**
 * Default {@link SectionHierarchyConfiguration} used by the system.
 * @privateRemarks Exported for testing purposes.
 */
export const defaultSectionHierarchyConfig: SectionHierarchyConfiguration = {
	kind: HierarchyKind.Section,
	headingText: defaultHeadingText,
};

/**
 * Default {@link DocumentHierarchyProperties.documentName} for non-folder hierarchy documents.
 *
 * Uses the item's scoped and qualified API name, but is handled differently for the following items:
 *
 * - Model: "index"
 *
 * @privateRemarks Exported for testing purposes.
 */
export function defaultDocumentName(apiItem: ApiItem): string | undefined {
	const kind = getApiItemKind(apiItem);
	switch (kind) {
		case ApiItemKind.Model: {
			return "index";
		}
		default: {
			// Let the system generate a unique name that accounts for folder hierarchy.
			return undefined;
		}
	}
}

/**
 * Default {@link DocumentHierarchyConfiguration} used by the system.
 * @privateRemarks Exported for testing purposes.
 */
export const defaultDocumentHierarchyConfig: DocumentHierarchyConfiguration = {
	kind: HierarchyKind.Document,
	headingText: defaultHeadingText,
	documentName: defaultDocumentName,
};

/**
 * Default {@link SectionHierarchyConfiguration} used by the system.
 *
 * @privateRemarks Exported for testing purposes.
 */
export const defaultFolderName = undefined;

/**
 * Default {@link FolderHierarchyConfiguration} used by the system.
 * @privateRemarks Exported for testing purposes.
 */
export const defaultFolderHierarchyConfig: FolderHierarchyConfiguration = {
	kind: HierarchyKind.Folder,
	headingText: defaultHeadingText,
	documentName: defaultDocumentName,
	documentPlacement: FolderDocumentPlacement.Outside, // TODO
	// documentName: "index", // Documents for items that get their own folder are always named "index" by default.
	folderName: defaultFolderName,
};

/**
 * Hierarchy options by API item kind.
 *
 * @public
 */
export type HierarchyConfiguration = {
	/**
	 * Hierarchy configuration for the API item kind.
	 */
	[Kind in Exclude<
		ValidApiItemKind,
		ApiItemKind.Model | ApiItemKind.EntryPoint | ApiItemKind.Package
	>]: DocumentationHierarchyConfiguration;
} & {
	/**
	 * Hierarchy configuration for the `Model` API item kind.
	 *
	 * @remarks
	 * Always its own document. Never introduces folder hierarchy.
	 * This is an important invariant, as it ensures that there is always at least one document in the output.
	 */
	[ApiItemKind.Model]: DocumentHierarchyConfiguration;

	/**
	 * Hierarchy configuration for the `Package` API item kind.
	 *
	 * @remarks Must be either a folder or document hierarchy configuration.
	 *
	 * @privateRemarks
	 * TODO: Allow all hierarchy configurations for packages.
	 * There isn't a real reason to restrict this, except the way the code is currently structured.
	 */
	[ApiItemKind.Package]: DocumentHierarchyConfiguration | FolderHierarchyConfiguration;

	/**
	 * Hierarchy configuration for the `EntryPoint` API item kind.
	 *
	 * @remarks
	 * Always its own document, adjacent to the package document.
	 * When a package only has a single entrypoint, this is skipped entirely and entrypoint children are rendered directly to the package document.
	 *
	 * @privateRemarks
	 * TODO: Allow all hierarchy configurations for packages.
	 * There isn't a real reason to restrict this, except the way the code is currently structured.
	 */
	[ApiItemKind.EntryPoint]: DocumentHierarchyConfiguration;
};

/**
 * Partial {@link HierarchyConfiguration} provided as user input.
 */
export type HierarchyOptions = Partial<HierarchyConfiguration>;

/**
 * Default {@link HierarchyConfiguration}.
 */
export const defaultHierarchyConfiguration: HierarchyConfiguration = {
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
 * Gets a complete {@link HierarchyConfiguration} using the provided partial configuration, and filling
 * in the remainder with defaults.
 */
export function getHierarchyOptionsWithDefaults(
	inputOptions: HierarchyOptions | undefined,
): HierarchyConfiguration {
	return { ...defaultHierarchyConfiguration, ...inputOptions };
}
