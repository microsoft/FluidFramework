/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiModel } from "@microsoft/api-extractor-model";

import { defaultConsoleLogger } from "../../Logging.js";
import type { LoggingConfiguration } from "../../LoggingConfiguration.js";

import {
	type DocumentationSuiteOptions,
	getDocumentationSuiteOptionsWithDefaults,
} from "./DocumentationSuiteOptions.js";
import {
	type ApiItemTransformations,
	getApiItemTransformationsWithDefaults,
} from "./Transformations.js";

/**
 * Shared base type for {@link ApiItemTransformationConfiguration} and {@link ApiItemTransformationOptions}.
 *
 * @remarks Not intended to be used directly.
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
 * System configuration for API Item transformation functionality.
 *
 * @privateRemarks
 * TODO: ideally this type should not appear in the public API.
 * Users should only need {@link ApiItemTransformationOptions}.
 *
 * @public
 */
export interface ApiItemTransformationConfiguration
	extends ApiItemTransformationConfigurationBase,
		ApiItemTransformations,
		Required<DocumentationSuiteOptions>,
		Required<LoggingConfiguration> {}

/**
 * Input options for API Item transformation APIs.
 *
 * @public
 */
export interface ApiItemTransformationOptions
	extends ApiItemTransformationConfigurationBase,
		Partial<ApiItemTransformations>,
		DocumentationSuiteOptions,
		LoggingConfiguration {}

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
	const documentationSuiteOptions = getDocumentationSuiteOptionsWithDefaults(inputOptions);
	const transformationOptions = getApiItemTransformationsWithDefaults(inputOptions);
	return {
		...documentationSuiteOptions,
		...transformationOptions,
		apiModel: inputOptions.apiModel,
		uriRoot: inputOptions.uriRoot,
		logger,
	};
}
