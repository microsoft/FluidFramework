/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConfigurationBase } from "../../../ConfigurationBase.js";
import { defaultConsoleLogger } from "../../../Logging.js";

import type { Renderers } from "./RenderOptions.js";

/**
 * Configuration for Markdown rendering of generated documentation contents.
 *
 * @public
 */
export interface RenderConfiguration extends ConfigurationBase {
	/**
	 * User-specified renderers.
	 *
	 * @remarks May override default behaviors or add rendering capabilities for custom {@link DocumentationNode}s.
	 */
	readonly customRenderers?: Renderers;

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
