/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { NewlineKind } from "@rushstack/node-core-library";

import { ConfigurationBase } from "../../ConfigurationBase";
import { defaultConsoleLogger } from "../../Logging";
import { MarkdownRenderers, getRenderersWithDefaults } from "./RenderOptions";

/**
 * Configuration for Markdown rendering of generated documentation contents.
 */
export interface RenderConfiguration extends ConfigurationBase {
	/**
	 * Specifies what type of newlines API Documenter should use when writing output files.
	 *
	 * @defaultValue {@link @rushstack/node-core-library#NewlineKind.OsDefault}
	 */
	readonly newlineKind?: NewlineKind;

	/**
	 * {@inheritDoc MarkdownRenderers}
	 */
	readonly renderers?: MarkdownRenderers;

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
	inputConfig: RenderConfiguration,
): Required<RenderConfiguration> {
	const renderers = getRenderersWithDefaults(inputConfig.renderers);
	return {
		logger: inputConfig.logger ?? defaultConsoleLogger,
		newlineKind: inputConfig.newlineKind ?? NewlineKind.OsDefault,
		startingHeadingLevel: inputConfig.startingHeadingLevel ?? 1,
		renderers,
	};
}
