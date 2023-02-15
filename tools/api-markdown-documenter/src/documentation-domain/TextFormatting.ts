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
	readonly italic?: boolean;

	/**
	 * @defaultValue Inherit
	 */
	readonly bold?: boolean;

	/**
	 * @defaultValue Inherit
	 */
	readonly strikethrough?: boolean;

	// TODO: underline?
	// TODO: what else?
}
