/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Node } from "mdast";

import type { Heading } from "../Heading.js";

/**
 * A document heading.
 *
 * @remarks
 *
 * Heading level is determined by the position in the document in terms of {@link SectionNode} hierarchy.
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
 * @sealed
 * @public
 */
export class HeadingNode implements Node, Heading {
	public readonly type = "heading";

	public constructor(
		/**
		 * {@inheritDoc Heading.title}
		 */
		public readonly title: string,

		/**
		 * {@inheritDoc Heading.id}
		 */
		public readonly id?: string,
	) {}

	/**
	 * Generates a `HeadingNode` from the provided {@link Heading}.
	 */
	public static createFromPlainTextHeading(heading: Heading): HeadingNode {
		return new HeadingNode(heading.title, heading.id);
	}
}
