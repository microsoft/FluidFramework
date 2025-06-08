/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Heading } from "../Heading.js";

import type { DocumentationNode } from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";

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
export class HeadingNode implements DocumentationNode, Heading {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Heading;

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
		return this.title.length === 0;
	}

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
