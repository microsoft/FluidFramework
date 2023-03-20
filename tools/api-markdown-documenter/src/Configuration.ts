/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { NewlineKind } from "@rushstack/node-core-library";

import {
	ApiItemTransformationConfiguration,
	getApiItemTransformationConfigurationWithDefaults,
} from "./api-item-transforms";

/**
 * Configuration options for the Markdown documenter.
 */
export interface MarkdownDocumenterConfiguration extends ApiItemTransformationConfiguration {
	/**
	 * Specifies what type of newlines API Documenter should use when writing output files.
	 *
	 * @defaultValue {@link @rushstack/node-core-library#NewlineKind.OsDefault}
	 */
	readonly newlineKind?: NewlineKind;
}

/**
 * Creates a complete system configuration by filling in any optional properties with defaults.
 * @param partialConfig - Configuration with optional properties. Any missing properties will be filled in with
 * default values. Any specified properties will take precedence over defaults.
 */
export function markdownDocumenterConfigurationWithDefaults(
	partialConfig: MarkdownDocumenterConfiguration,
): Required<MarkdownDocumenterConfiguration> {
	const apiItemTransformationConfiguration =
		getApiItemTransformationConfigurationWithDefaults(partialConfig);
	return {
		newlineKind: NewlineKind.OsDefault,
		...apiItemTransformationConfiguration,
		...partialConfig,
	};
}
