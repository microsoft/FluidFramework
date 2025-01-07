/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";

import type { ValidApiItemKind, Mutable } from "../../utilities/index.js";

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
 * {@inheritDoc SectionHierarchyConfiguration}
 *
 * @public
 */
export type SectionHierarchyOptions =
	DocumentationHierarchyConfigurationBase<HierarchyKind.Section>;

/**
 * {@link HierarchyKind.Document} hierarchy configuration properties.
 *
 * @public
 */
export interface DocumentHierarchyProperties {
	/**
	 * Document name to use for the API item.
	 *
	 * @defaultValue {@link DocumentationSuiteConfiguration.getFolderNameForItem}
	 */
	readonly documentName:
		| string
		| undefined
		| ((apiItem: ApiItem, hierarchyConfig: HierarchyConfiguration) => string | undefined);
}

/**
 * The corresponding API item will get its own document, in the folder for an ancestor of the API item.
 *
 * @public
 */
export type DocumentHierarchyConfiguration =
	DocumentationHierarchyConfigurationBase<HierarchyKind.Document> & DocumentHierarchyProperties;

/**
 * {@inheritDoc DocumentHierarchyConfiguration}
 *
 * @public
 */
export type DocumentHierarchyOptions =
	DocumentationHierarchyConfigurationBase<HierarchyKind.Document> &
		Partial<DocumentHierarchyProperties>;

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
 * {@link HierarchyKind.Folder} hierarchy configuration properties.
 *
 * @sealed
 * @public
 */
export interface FolderHierarchyProperties extends DocumentHierarchyProperties {
	/**
	 * Placement of the API item's document relative to its generated folder.
	 */
	readonly documentPlacement: FolderDocumentPlacement;

	/**
	 * Folder name to use for the API item.
	 *
	 * @defaultValue {@link DocumentationSuiteConfiguration.getFolderNameForItem}
	 */
	readonly folderName:
		| string
		| undefined
		| ((apiItem: ApiItem, hierarchyConfig: HierarchyConfiguration) => string | undefined);
}

/**
 * The corresponding API item will get its own document, in the folder for an ancestor of the API item.
 *
 * @sealed
 * @public
 */
export type FolderHierarchyConfiguration =
	DocumentationHierarchyConfigurationBase<HierarchyKind.Folder> & FolderHierarchyProperties;

/**
 * {@inheritDoc FolderHierarchyConfiguration}
 *
 * @sealed
 * @public
 */
export type FolderHierarchyOptions = DocumentationHierarchyConfigurationBase<HierarchyKind.Folder> &
	Partial<FolderHierarchyProperties>;

/**
 * API item hierarchy configuration.
 *
 * @sealed
 * @public
 */
export type DocumentationHierarchyConfiguration =
	| SectionHierarchyConfiguration
	| DocumentHierarchyConfiguration
	| FolderHierarchyConfiguration;

/**
 * API item hierarchy configuration.
 *
 * @sealed
 * @public
 */
export type DocumentationHierarchyOptions =
	| SectionHierarchyOptions
	| DocumentHierarchyOptions
	| FolderHierarchyOptions;

/**
 * Default {@link SectionHierarchyConfiguration} used by the system.
 */
export const defaultSectionHierarchyConfig: SectionHierarchyConfiguration = {
	kind: HierarchyKind.Section,
};

/**
 * Default {@link DocumentHierarchyConfiguration} used by the system.
 */
export const defaultDocumentHierarchyConfig: DocumentHierarchyConfiguration = {
	kind: HierarchyKind.Document,
	documentName: undefined, // Use suite configuration default.
};

/**
 * Default {@link FolderHierarchyConfiguration} used by the system.
 */
export const defaultFolderHierarchyConfig: FolderHierarchyConfiguration = {
	kind: HierarchyKind.Folder,
	documentName: undefined, // Use suite configuration default.
	documentPlacement: FolderDocumentPlacement.Outside, // TODO
	folderName: undefined, // Use suite configuration default.
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
	>]?: HierarchyKind | DocumentationHierarchyOptions;
} & {
	/**
	 * Hierarchy configuration for the `Model` API item kind.
	 *
	 * @remarks
	 * Always its own document. Never introduces folder hierarchy.
	 * This is an important invariant, as it ensures that there is always at least one document in the output.
	 */
	[ApiItemKind.Model]?: HierarchyKind.Document | DocumentHierarchyOptions;

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
		| DocumentHierarchyOptions
		| FolderHierarchyOptions;

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
	[ApiItemKind.EntryPoint]?: HierarchyKind.Document | DocumentHierarchyOptions;
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
	option: HierarchyKind | DocumentationHierarchyOptions,
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
			const kind = option.kind;
			switch (kind) {
				case HierarchyKind.Section: {
					return { ...defaultSectionHierarchyConfig, ...option };
				}
				case HierarchyKind.Document: {
					return { ...defaultDocumentHierarchyConfig, ...option };
				}
				case HierarchyKind.Folder: {
					return { ...defaultFolderHierarchyConfig, ...option };
				}
				default: {
					throw new Error(`Invalid hierarchy configuration kind: ${kind}`);
				}
			}
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
