/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
} from "./Configuration";
export {
	// Consumers should not use this, it exists externally for documentation purposes only.
	type DefaultDocumentationSuiteOptions,
	DocumentBoundaries,
	DocumentationSuiteOptions,
	getDocumentationSuiteOptionsWithDefaults,
	HierarchyBoundaries,
} from "./DocumentationSuiteOptions";
export {
	ApiItemTransformationOptions,
	getApiItemTransformationOptionsWithDefaults,
	TransformApiItemWithChildren,
	TransformApiItemWithoutChildren,
} from "./TransformationOptions";
