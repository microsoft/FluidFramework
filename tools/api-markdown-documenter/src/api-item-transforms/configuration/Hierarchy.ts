/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApiItem, ApiItemKind, type ApiPackage } from "@microsoft/api-extractor-model";

import {
	getApiItemKind,
	getUnscopedPackageName,
	type ValidApiItemKind,
} from "../../utilities/index.js";
import { createQualifiedDocumentNameForApiItem } from "../ApiItemTransformUtilities.js";

/**
 * Kind of documentation suite hierarchy.
 *
 * @public
 */
export enum HierarchyKind {
	/**
	 * The API item gets a section under the document representing an ancestor of the API item.
	 */
	Section = "Section",

	/**
	 * The API item gets its own document, in the folder for an ancestor of the API item.
	 */
	Document = "Document",

	/**
	 * The API item gets its own document, and generates folder hierarchy for all descendent API items.
	 */
	Folder = "Folder",
}

/**
 * {@link DocumentationHierarchyConfiguration} base interface.
 *
 * @remarks
 * Not intended for external use.
 * Only exists to share common properties between hierarchy configuration types.
 *
 * @sealed
 * @public
 */
export interface DocumentationHierarchyConfigurationBase {
	/**
	 * {@inheritDoc HierarchyKind}
	 */
	readonly kind: HierarchyKind;
}

/**
 * The corresponding API item will be placed in a section under the document representing an ancestor of the API item.
 *
 * @sealed
 * @public
 */
export interface SectionHierarchyConfiguration extends DocumentationHierarchyConfigurationBase {
	/**
	 * {@inheritDoc DocumentationHierarchyConfigurationBase.kind}
	 */
	readonly kind: HierarchyKind.Section;
}

/**
 * The corresponding API item will get its own document, in the folder for an ancestor of the API item.
 *
 * @sealed
 * @public
 */
export interface DocumentHierarchyConfiguration extends DocumentationHierarchyConfigurationBase {
	/**
	 * {@inheritDoc DocumentationHierarchyConfigurationBase.kind}
	 */
	readonly kind: HierarchyKind.Document;
}

/**
 * Placement of the API item's document relative to its generated folder.
 *
 * @public
 */
export enum FolderDocumentPlacement {
	/**
	 * The document is placed inside its folder.
	 */
	Inside = "Inside",

	/**
	 * The document is placed outside (adjacent to) its folder.
	 */
	Outside = "Outside",
}

/**
 * The corresponding API item will get its own document, in the folder for an ancestor of the API item.
 *
 * @sealed
 * @public
 */
export interface FolderHierarchyConfiguration extends DocumentationHierarchyConfigurationBase {
	/**
	 * {@inheritDoc DocumentationHierarchyConfigurationBase.kind}
	 */
	readonly kind: HierarchyKind.Folder;

	/**
	 * Placement of the API item's document relative to its generated folder.
	 *
	 * @defaultValue {@link FolderDocumentPlacement.Inside}
	 */
	readonly documentPlacement: FolderDocumentPlacement;
}

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
 * Default {@link SectionHierarchyConfiguration} used by the system.
 */
const defaultSectionHierarchyOptions = {
	kind: HierarchyKind.Section,
} satisfies SectionHierarchyConfiguration;

/**
 * Default {@link DocumentHierarchyConfiguration} used by the system.
 */
const defaultDocumentHierarchyOptions = {
	kind: HierarchyKind.Document,
} satisfies DocumentHierarchyConfiguration;

/**
 * Default {@link FolderHierarchyConfiguration} used by the system.
 */
const defaultFolderHierarchyOptions = {
	kind: HierarchyKind.Folder,
	documentPlacement: FolderDocumentPlacement.Inside,
} satisfies FolderHierarchyConfiguration;

/**
 * Complete hierarchy configuration by API item kind.
 *
 * @public
 */
export type HierarchyConfiguration = {
	/**
	 * Hierarchy configuration for the API item kind.
	 */
	readonly [Kind in Exclude<
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
	readonly [ApiItemKind.Model]: DocumentHierarchyConfiguration;

	/**
	 * Hierarchy configuration for the `Package` API item kind.
	 *
	 * @remarks Must be either a folder or document hierarchy configuration.
	 *
	 * @privateRemarks
	 * TODO: Allow all hierarchy configurations for packages.
	 * There isn't a real reason to restrict this, except the way the code is currently structured.
	 */
	readonly [ApiItemKind.Package]: DocumentHierarchyConfiguration | FolderHierarchyConfiguration;

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
	readonly [ApiItemKind.EntryPoint]: DocumentHierarchyConfiguration;

	/**
	 * {@inheritDoc HierarchyOptions.getDocumentName}
	 */
	readonly getDocumentName: (apiItem: ApiItem, config: HierarchyConfiguration) => string;

	/**
	 * {@inheritDoc HierarchyOptions.getFolderName}
	 */
	readonly getFolderName: (apiItem: ApiItem, config: HierarchyConfiguration) => string;
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
	readonly [Kind in Exclude<
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
	readonly [ApiItemKind.Model]?: HierarchyKind.Document | DocumentHierarchyConfiguration;

	/**
	 * Hierarchy configuration for the `Package` API item kind.
	 *
	 * @remarks Must be either a folder or document hierarchy configuration.
	 *
	 * @privateRemarks
	 * TODO: Allow all hierarchy configurations for packages.
	 * There isn't a real reason to restrict this, except the way the code is currently structured.
	 */
	readonly [ApiItemKind.Package]?:
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
	readonly [ApiItemKind.EntryPoint]?: HierarchyKind.Document | DocumentHierarchyConfiguration;

	/**
	 * Generate the desired document name for the provided `ApiItem`.
	 *
	 * @remarks
	 * Default document name for any item configured to generate document or folder level hierarchy.
	 * If not specified, a system default will be used.
	 *
	 * @param apiItem - The API item for which the document name is being generated.
	 */
	readonly getDocumentName?: (apiItem: ApiItem, config: HierarchyConfiguration) => string;

	/**
	 * Generate the desired folder name for the provided `ApiItem`.
	 *
	 * @remarks
	 * Default folder name for any item configured to generate folder level hierarchy.
	 * If not specified, a system default will be used.
	 *
	 * @param apiItem - The API item for which the folder name is being generated.
	 */
	readonly getFolderName?: (apiItem: ApiItem, config: HierarchyConfiguration) => string;
};

/**
 * Contains a list of default {@link DocumentationSuiteConfiguration} functions.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace DefaultHierarchyConfigurations {
	/**
	 * Default {@link HierarchyConfiguration.getDocumentName}.
	 *
	 * @remarks
	 * Uses the item's scoped and qualified API name, but is handled differently for the following items:
	 *
	 * - Model: "index"
	 *
	 * - Package: Use the unscoped package name.
	 */
	export function getDocumentName(apiItem: ApiItem, config: HierarchyConfiguration): string {
		const kind = getApiItemKind(apiItem);
		switch (kind) {
			case ApiItemKind.Model:
			case ApiItemKind.Namespace:
			case ApiItemKind.Package: {
				return "index";
			}
			default: {
				// Let the system generate a unique name that accounts for folder hierarchy.
				return createQualifiedDocumentNameForApiItem(apiItem, config);
			}
		}
	}

	/**
	 * Default {@link HierarchyConfiguration.getFolderName}.
	 *
	 * @remarks
	 * Uses the item's scoped and qualified API name, but is handled differently for the  following items:
	 *
	 * - Package: Use the unscoped package name.
	 */
	export function getFolderName(apiItem: ApiItem, config: HierarchyConfiguration): string {
		const kind = getApiItemKind(apiItem);
		switch (kind) {
			case ApiItemKind.Package: {
				return getUnscopedPackageName(apiItem as ApiPackage);
			}
			default: {
				// Let the system generate a unique name that accounts for folder hierarchy.
				return createQualifiedDocumentNameForApiItem(apiItem, config);
			}
		}
	}
}

/**
 * Default {@link HierarchyOptions}.
 */
const defaultHierarchyOptions = {
	[ApiItemKind.Model]: HierarchyKind.Document,

	// Items that introduce folder hierarchy:
	[ApiItemKind.Namespace]: HierarchyKind.Folder,
	[ApiItemKind.Package]: HierarchyKind.Folder,

	// Items that get their own document, but do not introduce folder hierarchy:
	[ApiItemKind.Class]: HierarchyKind.Document,
	[ApiItemKind.Enum]: HierarchyKind.Document,
	[ApiItemKind.EntryPoint]: HierarchyKind.Document,
	[ApiItemKind.Interface]: HierarchyKind.Document,
	[ApiItemKind.TypeAlias]: HierarchyKind.Document,

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
	option: HierarchyKind | DocumentationHierarchyConfiguration,
): DocumentationHierarchyConfiguration {
	switch (option) {
		case HierarchyKind.Section: {
			return defaultSectionHierarchyOptions;
		}
		case HierarchyKind.Document: {
			return defaultDocumentHierarchyOptions;
		}
		case HierarchyKind.Folder: {
			return defaultFolderHierarchyOptions;
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
export function getHierarchyConfigurationWithDefaults(
	options?: HierarchyOptions | undefined,
): HierarchyConfiguration {
	const { getDocumentName, getFolderName, ...hierarchyByItem } = options ?? {};

	const hierarchyOptions = {
		...defaultHierarchyOptions,
		...hierarchyByItem,
	};

	const hierarchyConfigurations = Object.fromEntries(
		Object.entries(hierarchyOptions).map(([key, value]) => [key, mapHierarchyOption(value)]),
	) as Omit<HierarchyConfiguration, "getDocumentName" | "getFolderName">;

	return {
		getDocumentName: getDocumentName ?? DefaultHierarchyConfigurations.getDocumentName,
		getFolderName: getFolderName ?? DefaultHierarchyConfigurations.getFolderName,
		...hierarchyConfigurations,
	};
}
