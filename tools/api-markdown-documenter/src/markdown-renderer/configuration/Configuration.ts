/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfigurationBase } from "../../ConfigurationBase";
import { defaultConsoleLogger } from "../../Logging";
import { MarkdownRenderers } from "./RenderOptions";

/**
 * Configuration for Markdown rendering of generated documentation contents.
 *
 * @public
 */
export interface RenderConfiguration extends ConfigurationBase {
	/**
	 * {@inheritDoc MarkdownRenderers}
	 */
	readonly customRenderers?: MarkdownRenderers;

	/**
	 * Optional override for the starting heading level of a document.
	 *
	 * @remarks Must be on [1, ∞).
	 *
	 * @defaultValue 1
	 */
	readonly startingHeadingLevel?: number;
}

/**
 * Gets a complete {@link RenderConfiguration} using the provided partial configuration, and filling
 * in the remainder with the documented defaults.
 */
export function getRenderConfigurationWithDefaults(
	inputConfig: Partial<RenderConfiguration> | undefined,
): RenderConfiguration {
	const logger = inputConfig?.logger ?? defaultConsoleLogger;
	const startingHeadingLevel = inputConfig?.startingHeadingLevel ?? 1;
	return {
		...inputConfig,
		logger,
		startingHeadingLevel,
	};
}
