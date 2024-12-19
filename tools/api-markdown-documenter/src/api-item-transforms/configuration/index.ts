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
export type {
	// Consumers should not use this, it exists externally for documentation purposes only.
	DefaultDocumentationSuiteOptions,
	DocumentBoundaries,
	DocumentationSuiteOptions,
	HierarchyBoundaries,
} from "./DocumentationSuiteOptions.js";
export type {
	ApiItemTransformations,
	TransformApiItemWithChildren,
	TransformApiItemWithoutChildren,
} from "./Transformations.js";
