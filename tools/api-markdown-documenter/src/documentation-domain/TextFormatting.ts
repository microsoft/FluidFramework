/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Text formatting options.
 *
 * @sealed
 * @public
 */
export interface TextFormatting {
	/**
	 * Whether or not the text should be rendered in italics.
	 *
	 * @defaultValue Inherit formatting from ancestry, if any exists.
	 */
	readonly italic?: boolean;

	/**
	 * Whether or not the text should be rendered in bold.
	 *
	 * @defaultValue Inherit formatting from ancestry, if any exists.
	 */
	readonly bold?: boolean;

	/**
	 * Whether or not the text should be rendered with a strikethrough.
	 *
	 * @defaultValue Inherit formatting from ancestry, if any exists.
	 */
	readonly strikethrough?: boolean;
}
