/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LoggingConfiguration } from "../LoggingConfiguration.js";

/**
 * Configuration for transforming docs to HTML.
 *
 * @public
 */
export interface TransformationConfiguration extends LoggingConfiguration {
	/**
	 * HTML language attribute.
	 *
	 * @defaultValue "en"
	 *
	 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang}
	 */
	readonly language?: string;
}
