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
	 * Display the associated content in italics.
	 */
	readonly italic?: true;

	/**
	 * Display the associated content in bold.
	 */
	readonly bold?: true;

	/**
	 * Display the associated content with a strikethrough.
	 */
	readonly strikethrough?: true;
}
