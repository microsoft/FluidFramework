/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationConfigurationBase,
	type ApiItemTransformationOptions,
	getApiItemTransformationConfigurationWithDefaults,
} from "./Configuration.js";
export {
	type DocumentationSuiteConfiguration,
	type DefaultDocumentationSuiteOptions,
	type DocumentationSuiteOptions,
	getDocumentationSuiteConfigurationWithDefaults as getDocumentationSuiteOptionsWithDefaults,
} from "./DocumentationSuiteOptions.js";
export {
	defaultDocumentHierarchyConfig,
	defaultDocumentName,
	defaultFolderName,
	defaultHeadingText,
	defaultFolderHierarchyConfig,
	defaultHierarchyConfiguration,
	defaultSectionHierarchyConfig,
	type DocumentationHierarchyConfiguration,
	type DocumentationHierarchyConfigurationBase,
	type DocumentHierarchyConfiguration,
	type DocumentHierarchyProperties,
	FolderDocumentPlacement,
	type FolderHierarchyConfiguration,
	type FolderHierarchyProperties,
	type HierarchyConfiguration,
	HierarchyKind,
	type SectionHierarchyConfiguration,
	type SectionHierarchyProperties,
} from "./Hierarchy.js";
export {
	type ApiItemTransformations,
	getApiItemTransformationsWithDefaults,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
} from "./Transformations.js";
