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
	readonly italic?: true;

	/**
	 * Whether or not the text should be rendered in bold.
	 *
	 * @defaultValue Inherit
	 */
	readonly bold?: true;

	/**
	 * Whether or not the text should be rendered with a strikethrough.
	 *
	 * @defaultValue Inherit
	 */
	readonly strikethrough?: true;
}
