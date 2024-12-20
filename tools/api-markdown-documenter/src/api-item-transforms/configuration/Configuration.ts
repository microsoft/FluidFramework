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
 * @sealed
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
		Required<DocumentationSuiteOptions>,
		Required<LoggingConfiguration> {
	/**
	 * {@inheritDoc ApiItemTransformations}
	 */
	readonly transformations: ApiItemTransformations;
}

/**
 * Input options for API Item transformation APIs.
 *
 * @public
 */
export interface ApiItemTransformationOptions
	extends ApiItemTransformationConfigurationBase,
		DocumentationSuiteOptions,
		LoggingConfiguration {
	/**
	 * Optional overrides for the default transformations.
	 */
	readonly transformations?: Partial<ApiItemTransformations>;
}

/**
 * Gets a complete {@link ApiItemTransformationConfiguration} using the provided partial configuration, and filling
 * in the remainder with the documented defaults.
 *
 * @public
 */
export function getApiItemTransformationConfigurationWithDefaults(
	options: ApiItemTransformationOptions,
): ApiItemTransformationConfiguration {
	const logger = options.logger ?? defaultConsoleLogger;
	const documentationSuiteOptions = getDocumentationSuiteOptionsWithDefaults(options);
	const transformations = getApiItemTransformationsWithDefaults(options?.transformations);
	return {
		...documentationSuiteOptions,
		transformations,
		apiModel: options.apiModel,
		uriRoot: options.uriRoot,
		logger,
	};
}
