/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApiItem, ApiItemKind, type ApiPackage } from "@microsoft/api-extractor-model";

import {
	getApiItemKind,
	type ValidApiItemKind,
	type Mutable,
	getFileSafeNameForApiItemName,
	getUnscopedPackageName,
} from "../../utilities/index.js";

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
 * The corresponding API item will be placed in a section under the document representing an ancestor of the API item.
 *
 * @public
 */
export type SectionHierarchyConfiguration =
	DocumentationHierarchyConfigurationBase<HierarchyKind.Section>;

/**
 * {@link HierarchyKind.Document} hierarchy configuration properties.
 *
 * @public
 */
export interface DocumentHierarchyProperties {
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
 * Default {@link SectionHierarchyConfiguration} used by the system.
 */
export const defaultSectionHierarchyConfig: SectionHierarchyConfiguration = {
	kind: HierarchyKind.Section,
};

/**
 * Default {@link DocumentHierarchyProperties.documentName} for non-folder hierarchy documents.
 *
 * @remarks
 * Uses the item's scoped and qualified API name, but is handled differently for the following items:
 *
 * - Model: "index"
 *
 * - Package: Use the unscoped package name.
 */
function defaultDocumentName(apiItem: ApiItem): string | undefined {
	const kind = getApiItemKind(apiItem);
	switch (kind) {
		case ApiItemKind.Model: {
			return "index";
		}
		case ApiItemKind.Package: {
			return getFileSafeNameForApiItemName(getUnscopedPackageName(apiItem as ApiPackage));
		}
		default: {
			// Let the system generate a unique name that accounts for folder hierarchy.
			return undefined;
		}
	}
}

/**
 * Default {@link DocumentHierarchyConfiguration} used by the system.
 */
export const defaultDocumentHierarchyConfig: DocumentHierarchyConfiguration = {
	kind: HierarchyKind.Document,
	documentName: defaultDocumentName,
};

/**
 * Default {@link DocumentHierarchyProperties.documentName} for non-folder hierarchy documents.
 *
 * @remarks
 * Uses the item's scoped and qualified API name, but is handled differently for the following items:
 *
 * - Package: Use the unscoped package name.
 */
function defaultFolderName(apiItem: ApiItem): string | undefined {
	const kind = getApiItemKind(apiItem);
	switch (kind) {
		case ApiItemKind.Package: {
			return getFileSafeNameForApiItemName(getUnscopedPackageName(apiItem as ApiPackage));
		}
		default: {
			// Let the system generate a unique name that accounts for folder hierarchy.
			return undefined;
		}
	}
}

/**
 * Default {@link FolderHierarchyConfiguration} used by the system.
 */
export const defaultFolderHierarchyConfig: FolderHierarchyConfiguration = {
	kind: HierarchyKind.Folder,
	documentName: defaultDocumentName,
	documentPlacement: FolderDocumentPlacement.Outside, // TODO
	// documentName: "index", // Documents for items that get their own folder are always named "index" by default.
	folderName: defaultFolderName,
};

/**
 * Complete hierarchy configuration by API item kind.
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
 * Input hierarchy options by API item kind.
 *
 * @remarks
 * For each option, you may provide 1 of 2 options:
 *
 * - {@link HierarchyKind}: the default configuration for that kind will be used.
 *
 * - A complete {@link DocumentationHierarchyConfiguration} to be used in place of any default.
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
	>]?: HierarchyKind | DocumentationHierarchyConfiguration;
} & {
	/**
	 * Hierarchy configuration for the `Model` API item kind.
	 *
	 * @remarks
	 * Always its own document. Never introduces folder hierarchy.
	 * This is an important invariant, as it ensures that there is always at least one document in the output.
	 */
	[ApiItemKind.Model]?: HierarchyKind.Document | DocumentHierarchyConfiguration;

	/**
	 * Hierarchy configuration for the `Package` API item kind.
	 *
	 * @remarks Must be either a folder or document hierarchy configuration.
	 *
	 * @privateRemarks
	 * TODO: Allow all hierarchy configurations for packages.
	 * There isn't a real reason to restrict this, except the way the code is currently structured.
	 */
	[ApiItemKind.Package]?:
		| HierarchyKind.Document
		| HierarchyKind.Folder
		| DocumentHierarchyConfiguration
		| FolderHierarchyConfiguration;

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
	[ApiItemKind.EntryPoint]?: HierarchyKind.Document | DocumentHierarchyConfiguration;
};

/**
 * Default {@link HierarchyConfiguration}.
 */
const defaultHierarchyConfiguration: HierarchyConfiguration = {
	[ApiItemKind.Model]: {
		kind: HierarchyKind.Document,
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
 * Maps an input option to a complete {@link DocumentationHierarchyConfiguration}.
 */
function mapHierarchyOption(
	option: HierarchyKind | DocumentationHierarchyConfiguration,
): DocumentationHierarchyConfiguration {
	switch (option) {
		case HierarchyKind.Section: {
			return defaultSectionHierarchyConfig;
		}
		case HierarchyKind.Document: {
			return defaultDocumentHierarchyConfig;
		}
		case HierarchyKind.Folder: {
			return defaultFolderHierarchyConfig;
		}
		default: {
			return option;
		}
	}
}

/**
 * Gets a complete {@link HierarchyConfiguration} using the provided partial configuration, and filling
 * in the remainder with defaults.
 */
export function getHierarchyOptionsWithDefaults(
	options?: HierarchyOptions,
): HierarchyConfiguration {
	if (options === undefined) {
		return defaultHierarchyConfiguration;
	}

	const result: Mutable<HierarchyConfiguration> = { ...defaultHierarchyConfiguration };
	for (const [key, maybeValue] of Object.entries(options)) {
		if (maybeValue !== undefined) {
			result[key] = mapHierarchyOption(maybeValue);
		}
	}
	return result;
}
