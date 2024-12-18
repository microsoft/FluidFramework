/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiModel } from "@microsoft/api-extractor-model";

import { defaultConsoleLogger } from "../../Logging.js";
import type { LoggingOptions } from "../../LoggingOptions.js";

import {
	type DocumentationSuiteConfiguration,
	type DocumentationSuiteOptions,
	getDocumentationSuiteConfigurationWithDefaults,
} from "./DocumentationSuiteOptions.js";
import { getHierarchyOptionsWithDefaults } from "./Hierarchy.js";
import {
	type ApiItemTransformations,
	getApiItemTransformationsWithDefaults,
} from "./Transformations.js";

/**
 * API Item transformation configuration base.
 *
 * @public
 */
export interface ApiItemTransformationConfigurationBase {
	/**
	 * API Model for which the documentation is being generated.
	 * This is the output of {@link https://api-extractor.com/ | API-Extractor}.
	 *
	 * @remarks
	 *
	 * Beyond being the root entry for rendering, this is used to resolve member links globally, etc.
	 *
	 * If you need to generate a model from API reports on disk, see {@link loadModel}.
	 */
	readonly apiModel: ApiModel;

	/**
	 * Default root URI used when generating content links.
	 */
	readonly uriRoot: string;
}

/**
 * Partial API Item transformation options.
 *
 * @public
 */
export interface ApiItemTransformationOptions
	extends ApiItemTransformationConfigurationBase,
		ApiItemTransformations,
		DocumentationSuiteOptions,
		LoggingOptions {}

/**
 * Complete API Item transformation configuration.
 *
 * @public
 */
export interface ApiItemTransformationConfiguration
	extends ApiItemTransformationConfigurationBase,
		Required<ApiItemTransformations>,
		DocumentationSuiteConfiguration,
		Required<LoggingOptions> {}

/**
 * Gets a complete {@link ApiItemTransformationConfiguration} using the provided partial configuration, and filling
 * in the remainder with the documented defaults.
 *
 * @public
 */
export function getApiItemTransformationConfigurationWithDefaults(
	inputOptions: ApiItemTransformationOptions,
): ApiItemTransformationConfiguration {
	const logger = inputOptions.logger ?? defaultConsoleLogger;
	const hierarchy = getHierarchyOptionsWithDefaults(inputOptions?.hierarchy);
	const documentationSuiteOptions = getDocumentationSuiteConfigurationWithDefaults(inputOptions);
	const transformationOptions = getApiItemTransformationsWithDefaults(inputOptions);
	return {
		...documentationSuiteOptions,
		...transformationOptions,
		apiModel: inputOptions.apiModel,
		uriRoot: inputOptions.uriRoot,
		hierarchy,
		logger,
	};
}
