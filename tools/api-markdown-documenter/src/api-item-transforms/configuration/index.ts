/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
} from "./Configuration.js";
export {
	// Consumers should not use this, it exists externally for documentation purposes only.
	type DefaultDocumentationSuiteOptions,
	type DocumentBoundaries,
	type DocumentationSuiteOptions,
	getDocumentationSuiteOptionsWithDefaults,
	type HierarchyBoundaries,
} from "./DocumentationSuiteOptions.js";
export {
	type ApiItemTransformationOptions,
	getApiItemTransformationOptionsWithDefaults,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
} from "./TransformationOptions.js";
