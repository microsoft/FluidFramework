/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a document heading.
 *
 * @example Markdown
 *
 * ```md
 * # Documentation 101
 * ```
 *
 * @example HTML
 *
 * ```html
 * <h1>Documentation 101</h1>
 * ```
 *
 * @public
 */
export interface Heading {
	/**
	 * Heading text content. Note: this must not contain newline characters.
	 */
	readonly title: string;

	/**
	 * Identifier to associate with the heading.
	 *
	 * @remarks Must be unique in a given document.
	 *
	 * @defaultValue No explicit identifier is associated with the heading.
	 * Links will have to refer to the heading by its title contents.
	 */
	readonly id?: string;

	/**
	 * Heading level.
	 *
	 * @remarks Must be on [0, ∞).
	 *
	 * @defaultValue Automatic based on contextual hierarchy.
	 */
	readonly level?: number;
}
