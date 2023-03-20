/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiModel } from "@microsoft/api-extractor-model";

import { ConfigurationBase } from "../../ConfigurationBase";
import { defaultConsoleLogger } from "../../Logging";
import {
	DocumentationSuiteOptions,
	getDocumentationSuiteOptionsWithDefaults,
} from "./DocumentationSuiteOptions";
import {
	ApiItemTransformationOptions,
	getApiItemTransformationOptionsWithDefaults,
} from "./TransformationOptions";

/**
 * API Item transformation configuration.
 */
export interface ApiItemTransformationConfiguration
	extends ApiItemTransformationOptions,
		DocumentationSuiteOptions,
		ConfigurationBase {
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
 */
export function getApiItemTransformationConfigurationWithDefaults(
	inputOptions: ApiItemTransformationConfiguration,
): Required<ApiItemTransformationConfiguration> {
	const documentationSuiteOptions = getDocumentationSuiteOptionsWithDefaults(inputOptions);
	const transformationOptions = getApiItemTransformationOptionsWithDefaults(inputOptions);
	return {
		apiModel: inputOptions.apiModel,
		uriRoot: inputOptions.uriRoot,
		logger: inputOptions.logger ?? defaultConsoleLogger,
		...documentationSuiteOptions,
		...transformationOptions,
	};
}
