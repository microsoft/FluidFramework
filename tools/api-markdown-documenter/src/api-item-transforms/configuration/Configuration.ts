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
	getApiItemTransformationOptionsWithDefaults,
} from "./TransformationOptions.js";

/**
 * API Item transformation configuration.
 *
 * @public
 */
export interface ApiItemTransformationConfiguration
	extends ApiItemTransformations,
		DocumentationSuiteOptions,
		LoggingConfiguration {
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
	apiModel: ApiModel;

	/**
	 * Default root URI used when generating content links.
	 */
	readonly uriRoot: string;
}

/**
 * Gets a complete {@link ApiItemTransformationConfiguration} using the provided partial configuration, and filling
 * in the remainder with the documented defaults.
 *
 * @public
 */
export function getApiItemTransformationConfigurationWithDefaults(
	inputOptions: ApiItemTransformationConfiguration,
): Required<ApiItemTransformationConfiguration> {
	const logger = inputOptions.logger ?? defaultConsoleLogger;
	const documentationSuiteOptions = getDocumentationSuiteOptionsWithDefaults(inputOptions);
	const transformationOptions = getApiItemTransformationOptionsWithDefaults(inputOptions);
	return {
		...documentationSuiteOptions,
		...transformationOptions,
		apiModel: inputOptions.apiModel,
		uriRoot: inputOptions.uriRoot,
		logger,
	};
}
