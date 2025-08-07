/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultConsoleLogger } from "../../Logging.js";
import type { LoggingConfiguration } from "../../LoggingConfiguration.js";

import type { Transformations } from "./Transformation.js";

/**
 * Configuration for transforming docs to HTML.
 *
 * @public
 */
export interface TransformationConfiguration extends LoggingConfiguration {
	/**
	 * User-specified transformations.
	 *
	 * @remarks May override default behaviors or add transformation capabilities for custom node kinds.
	 */
	readonly customTransformations?: Transformations;

	/**
	 * Optional override for the starting heading level of a document.
	 *
	 * @remarks Must be on [1, ∞).
	 *
	 * @defaultValue 1
	 */
	readonly startingHeadingLevel?: number;

	/**
	 * HTML language attribute.
	 *
	 * @defaultValue "en"
	 *
	 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang}
	 */
	readonly language?: string;
}

/**
 * Gets a complete {@link TransformationConfiguration} using the provided partial configuration, and filling
 * in the remainder with the documented defaults.
 */
export function getConfigurationWithDefaults(
	inputConfig: Partial<TransformationConfiguration> | undefined,
): TransformationConfiguration {
	const logger = inputConfig?.logger ?? defaultConsoleLogger;
	const startingHeadingLevel = inputConfig?.startingHeadingLevel ?? 1;
	return {
		...inputConfig,
		logger,
		startingHeadingLevel,
	};
}
