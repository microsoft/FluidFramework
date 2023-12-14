/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Text formatting options.
 *
 * @public
 */
export interface TextFormatting {
	/**
	 * Whether or not the text should be rendered in italics.
	 *
	 * @defaultValue Inherit
	 */
	readonly italic?: boolean;

	/**
	 * Whether or not the text should be rendered in bold.
	 *
	 * @defaultValue Inherit
	 */
	readonly bold?: boolean;

	/**
	 * Whether or not the text should be rendered with a strikethrough.
	 *
	 * @defaultValue Inherit
	 */
	readonly strikethrough?: boolean;
}
