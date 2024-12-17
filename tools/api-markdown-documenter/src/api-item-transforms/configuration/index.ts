/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
} from "./Configuration.js";
export {
	type DefaultDocumentationSuiteOptions,
	type DocumentationSuiteOptions,
	getDocumentationSuiteOptionsWithDefaults,
} from "./DocumentationSuiteOptions.js";
export {
	HierarchyKind,
	type HierarchyConfigBase,
	type SectionHierarchyOptions,
	type SectionHierarchyConfig,
	type DocumentHierarchyOptions,
	type DocumentHierarchyConfig,
	FolderDocumentPlacement,
	type FolderHierarchyOptions,
	type FolderHierarchyConfig,
	type HierarchyConfig,
	defaultHierarchyConfig,
} from "./HierarchyOptions.js";
export {
	type ApiItemTransformationOptions,
	getApiItemTransformationOptionsWithDefaults,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
} from "./TransformationOptions.js";
