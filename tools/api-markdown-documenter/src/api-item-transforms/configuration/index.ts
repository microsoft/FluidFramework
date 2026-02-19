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
	type DefaultDocumentationSuiteConfiguration,
	type DocumentationSuiteConfiguration,
	type DocumentationSuiteOptions,
	getDocumentationSuiteConfigurationWithDefaults as getDocumentationSuiteOptionsWithDefaults,
} from "./DocumentationSuite.js";
export {
	type DocumentHierarchyConfiguration,
	type DocumentationHierarchyConfiguration,
	type DocumentationHierarchyConfigurationBase,
	FolderDocumentPlacement,
	type FolderHierarchyConfiguration,
	type HierarchyConfiguration,
	HierarchyKind,
	type HierarchyOptions,
	type SectionHierarchyConfiguration,
} from "./Hierarchy.js";
export {
	type ApiItemTransformations,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
	getApiItemTransformationsWithDefaults,
} from "./Transformations.js";
