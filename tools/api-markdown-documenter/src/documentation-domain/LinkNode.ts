/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Link, UrlTarget } from "../Link.js";

import type { DocumentationNode } from "./DocumentationNode.js";

/**
 * A hyperlink to some other content.
 *
 * @example Markdown
 *
 * ```md
 * [Fluid Framework](https://fluidframework.com/)
 * ```
 *
 * @example HTML
 *
 * ```html
 * <a href="https://fluidframework.com/">Fluid Framework</a>
 * ```
 *
 * @sealed
 * @public
 */
export class LinkNode implements DocumentationNode, Link {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "link";

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine = true;

	/**
	 * {@inheritDoc DocumentationNode.isLiteral}
	 */
	public readonly isLiteral = false;

	/**
	 * {@inheritDoc DocumentationNode.isParent}
	 */
	public readonly isParent = false;

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public get isEmpty(): boolean {
		return this.text.length === 0 && this.target.length === 0;
	}

	public constructor(
		/**
		 * {@inheritDoc Link.text}
		 */
		public readonly text: string,

		/**
		 * {@inheritDoc Link.target}
		 */
		public readonly target: UrlTarget,
	) {}

	/**
	 * Generates a {@link LinkNode} from the provided {@link Link}.
	 *
	 * @param link - The link to represent. Note: its text must not contain newline characters.
	 */
	public static createFromPlainTextLink(link: Link): LinkNode {
		return new LinkNode(link.text, link.target);
	}
}
