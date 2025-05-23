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
		return this.text.isEmpty;
	}

	public constructor(
		public readonly text: PlainTextNode,

		/**
		 * {@inheritDoc Heading.id}
		 */
		public readonly id?: string,
	) {}

	/**
	 * Generates a `HeadingNode` from the provided string.
	 * @param text - The node contents. Note: this must not contain newline characters.
	 * @param id - See {@link Heading.id}
	 * @param level - See {@link Heading.level}
	 */
	public static createFromPlainText(text: string, id?: string): HeadingNode {
		return new HeadingNode(new PlainTextNode(text), id);
	}

	/**
	 * Generates a `HeadingNode` from the provided {@link Heading}.
	 */
	public static createFromPlainTextHeading(heading: Heading): HeadingNode {
		return HeadingNode.createFromPlainText(heading.title, heading.id);
	}
}
