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
	HierarchyKind,
	type DocumentationHierarchyConfigurationBase,
	type SectionHierarchyProperties,
	type SectionHierarchyConfiguration,
	type DocumentHierarchyProperties,
	type DocumentHierarchyConfiguration,
	FolderDocumentPlacement,
	type FolderHierarchyProperties,
	type FolderHierarchyConfiguration,
	type DocumentationHierarchyConfiguration,
	type HierarchyConfiguration,
} from "./HierarchyOptions.js";
export {
	type ApiItemTransformations,
	getApiItemTransformationsWithDefaults,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
} from "./Transformations.js";
