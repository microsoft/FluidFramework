/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";

import type { ValidApiItemKind } from "../../utilities/index.js";

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
	 * @defaultValue {@link DocumentationSuiteOptions.getDocumentNameForItem}
	 */
	readonly documentName: string | ((apiItem: ApiItem) => string);
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
	 * @defaultValue {@link DocumentationSuiteOptions.getFolderNameForItem}
	 */
	readonly folderName: string | ((apiItem: ApiItem) => string);
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
const defaultSectionHierarchyOptions = {
	kind: HierarchyKind.Section,
} satisfies SectionHierarchyOptions;

/**
 * Default {@link DocumentHierarchyConfiguration} used by the system.
 */
const defaultDocumentHierarchyOptions = {
	kind: HierarchyKind.Document,
} satisfies DocumentHierarchyOptions;

/**
 * Default {@link FolderHierarchyConfiguration} used by the system.
 */
const defaultFolderHierarchyOptions = {
	kind: HierarchyKind.Folder,
	documentName: undefined, // TODO: "index"
	documentPlacement: FolderDocumentPlacement.Outside, // TODO: inside
} satisfies FolderHierarchyOptions;

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
const defaultHierarchyOptions = {
	[ApiItemKind.Model]: {
		kind: HierarchyKind.Document,
		documentName: "index",
	},

	// Items that introduce folder hierarchy:
	[ApiItemKind.Namespace]: HierarchyKind.Folder,
	[ApiItemKind.Package]: HierarchyKind.Folder,

	// Items that get their own document, but do not introduce folder hierarchy:
	[ApiItemKind.Class]: HierarchyKind.Document,
	[ApiItemKind.Enum]: HierarchyKind.Section, // TODO: Document
	[ApiItemKind.EntryPoint]: HierarchyKind.Document,
	[ApiItemKind.Interface]: HierarchyKind.Document,
	[ApiItemKind.TypeAlias]: HierarchyKind.Section, // TODO: Document

	// Items that get a section under the document representing an ancestor of the API item:
	[ApiItemKind.CallSignature]: HierarchyKind.Section,
	[ApiItemKind.Constructor]: HierarchyKind.Section,
	[ApiItemKind.ConstructSignature]: HierarchyKind.Section,
	[ApiItemKind.EnumMember]: HierarchyKind.Section,
	[ApiItemKind.Function]: HierarchyKind.Section,
	[ApiItemKind.IndexSignature]: HierarchyKind.Section,
	[ApiItemKind.Method]: HierarchyKind.Section,
	[ApiItemKind.MethodSignature]: HierarchyKind.Section,
	[ApiItemKind.Property]: HierarchyKind.Section,
	[ApiItemKind.PropertySignature]: HierarchyKind.Section,
	[ApiItemKind.Variable]: HierarchyKind.Section,
} as const;

/**
 * Maps an input option to a complete {@link DocumentationHierarchyConfiguration}.
 */
function mapHierarchyOption(
	option: HierarchyKind | DocumentationHierarchyOptions,
	defaultDocumentName: string | ((apiItem: ApiItem) => string),
	defaultFolderName: string | ((apiItem: ApiItem) => string),
): DocumentationHierarchyConfiguration {
	switch (option) {
		case HierarchyKind.Section: {
			return defaultSectionHierarchyOptions;
		}
		case HierarchyKind.Document: {
			return {
				...defaultDocumentHierarchyOptions,
				documentName: defaultDocumentName,
			};
		}
		case HierarchyKind.Folder: {
			return {
				...defaultFolderHierarchyOptions,
				documentName: defaultDocumentName,
				folderName: defaultFolderName,
			};
		}
		default: {
			const kind = option.kind;
			switch (kind) {
				case HierarchyKind.Section: {
					return { ...defaultSectionHierarchyOptions, ...option };
				}
				case HierarchyKind.Document: {
					return {
						...defaultDocumentHierarchyOptions,
						documentName: defaultDocumentName,
						...option,
					};
				}
				case HierarchyKind.Folder: {
					return {
						...defaultFolderHierarchyOptions,
						documentName: defaultDocumentName,
						folderName: defaultFolderName,
						...option,
					};
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
	hierarchyOptions: HierarchyOptions | undefined,
	defaultDocumentName: string | ((apiItem: ApiItem) => string),
	defaultFolderName: string | ((apiItem: ApiItem) => string),
): HierarchyConfiguration {
	const options: HierarchyOptions = {
		...defaultHierarchyOptions,
		...hierarchyOptions,
	};

	return Object.fromEntries(
		Object.entries(options).map(([key, option]) => [
			key,
			mapHierarchyOption(option, defaultDocumentName, defaultFolderName),
		]),
	) as HierarchyConfiguration;
}
