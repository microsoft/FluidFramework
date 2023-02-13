/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Text formatting options.
 */
export interface TextFormatting {
	/**
	 * @defaultValue Inherit
	 */
	italic?: boolean;

	/**
	 * @defaultValue Inherit
	 */
	bold?: boolean;

	/**
	 * @defaultValue Inherit
	 */
	strikethrough?: boolean;

	// TODO: underline?
	// TODO: what else?
}
