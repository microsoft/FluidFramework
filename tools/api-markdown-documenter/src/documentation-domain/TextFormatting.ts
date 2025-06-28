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
	 * Render the associated content with a bold formatting.
	 */
	readonly bold?: true;

	/**
	 * Render the associated content with a italic formatting.
	 */
	readonly italic?: true;

	/**
	 * Render the associated content with a strikethrough formatting.
	 */
	readonly strikethrough?: true;
}
