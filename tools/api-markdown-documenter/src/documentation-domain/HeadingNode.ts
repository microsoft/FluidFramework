/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Heading } from "../Heading.js";

import type { DocumentationNode } from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import { PlainTextNode } from "./PlainTextNode.js";

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
export class HeadingNode implements DocumentationNode<PlainTextNode>, Omit<Heading, "title"> {
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
		return this.title.isEmpty;
	}

	public constructor(
		/**
		 * {@inheritDoc Heading.title}
		 */
		public readonly title: PlainTextNode,

		/**
		 * {@inheritDoc Heading.id}
		 */
		public readonly id?: string,
	) {}

	/**
	 * Generates a `HeadingNode` from the provided string.
	 * @param title - See {@link Heading.title}
	 * @param id - See {@link Heading.id}
	 */
	public static createFromPlainText(title: string, id?: string): HeadingNode {
		return new HeadingNode(new PlainTextNode(title), id);
	}

	/**
	 * Generates a `HeadingNode` from the provided {@link Heading}.
	 */
	public static createFromPlainTextHeading(heading: Heading): HeadingNode {
		return HeadingNode.createFromPlainText(heading.title, heading.id);
	}
}
