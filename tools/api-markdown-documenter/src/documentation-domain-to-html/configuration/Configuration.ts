/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConfigurationBase } from "../../ConfigurationBase.js";
import type { TextFormatting } from "../../documentation-domain/index.js";
import { defaultConsoleLogger } from "../../Logging.js";
import { type Transformations } from "./Transformation.js";

/**
 * Configuration for transforming {@link DocumentationNode}s to HTML.
 *
 * @public
 */
export interface TransformationConfig extends ConfigurationBase {
	/**
	 * User-specified transformations.
	 *
	 * @remarks May override default behaviors or add transformation capabilities for custom {@link DocumentationNode}s.
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
	 * Optional formatting to apply to the entire document.
	 */
	readonly rootFormatting?: TextFormatting;

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
 * Gets a complete {@link TransformationConfig} using the provided partial configuration, and filling
 * in the remainder with the documented defaults.
 */
export function getConfigurationWithDefaults(
	inputConfig: Partial<TransformationConfig> | undefined,
): TransformationConfig {
	const logger = inputConfig?.logger ?? defaultConsoleLogger;
	const startingHeadingLevel = inputConfig?.startingHeadingLevel ?? 1;
	return {
		...inputConfig,
		logger,
		startingHeadingLevel,
	};
}
