/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem, ApiModel } from "@microsoft/api-extractor-model";

import { defaultConsoleLogger } from "../../Logging.js";
import type { LoggingConfiguration } from "../../LoggingConfiguration.js";
import type { SectionNode } from "../../documentation-domain/index.js";
import { createSectionForApiItem } from "../default-implementations/index.js";

import {
	type DocumentationSuiteConfiguration,
	type DocumentationSuiteOptions,
	getDocumentationSuiteConfigurationWithDefaults,
} from "./DocumentationSuite.js";
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
		DocumentationSuiteConfiguration,
		Required<LoggingConfiguration> {
	/**
	 * {@inheritDoc ApiItemTransformations}
	 */
	readonly transformations: ApiItemTransformations;

	/**
	 * Generates the default section layout used by all default {@link ApiItemTransformations}.
	 *
	 * @remarks
	 *
	 * Can be used to uniformly control the default output layout for all API item kinds.
	 *
	 * API item kind-specific details are passed in, and can be displayed as desired.
	 *
	 * @returns The list of {@link SectionNode}s that comprise the top-level section body for the API item.
	 */
	readonly defaultSectionLayout: (
		apiItem: ApiItem,
		childSections: SectionNode[] | undefined,
		config: ApiItemTransformationConfiguration,
	) => SectionNode[];
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

	/**
	 * {@inheritDoc ApiItemTransformationConfiguration.defaultSectionLayout}
	 */
	readonly defaultSectionLayout?: (
		apiItem: ApiItem,
		childSections: SectionNode[] | undefined,
		config: ApiItemTransformationConfiguration,
	) => SectionNode[];
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
	const defaultSectionLayout = options.defaultSectionLayout ?? createSectionForApiItem;
	const documentationSuiteOptions = getDocumentationSuiteConfigurationWithDefaults(options);
	const transformations = getApiItemTransformationsWithDefaults(options?.transformations);
	return {
		...documentationSuiteOptions,
		transformations,
		apiModel: options.apiModel,
		uriRoot: options.uriRoot,
		logger,
		defaultSectionLayout,
	};
}
