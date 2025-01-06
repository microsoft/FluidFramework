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
	type DefaultDocumentationSuiteConfiguration,
	type DocumentationSuiteOptions,
	getDocumentationSuiteConfigurationWithDefaults as getDocumentationSuiteOptionsWithDefaults,
} from "./DocumentationSuite.js";
export {
	type DocumentationHierarchyConfiguration,
	type DocumentationHierarchyConfigurationBase,
	type DocumentationHierarchyOptions,
	type DocumentHierarchyConfiguration,
	type DocumentHierarchyOptions,
	type DocumentHierarchyProperties,
	FolderDocumentPlacement,
	type FolderHierarchyConfiguration,
	type FolderHierarchyOptions,
	type FolderHierarchyProperties,
	type HierarchyConfiguration,
	type HierarchyOptions,
	HierarchyKind,
	type SectionHierarchyConfiguration,
	type SectionHierarchyOptions,
} from "./Hierarchy.js";
export {
	type ApiItemTransformations,
	getApiItemTransformationsWithDefaults,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
} from "./Transformations.js";
