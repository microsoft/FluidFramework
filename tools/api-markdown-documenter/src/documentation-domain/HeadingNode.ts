/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Heading } from "../Heading.js";

import {
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
	type SingleLineDocumentationNode,
} from "./DocumentationNode.js";
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
export class HeadingNode
	extends DocumentationParentNodeBase<SingleLineDocumentationNode>
	implements Omit<Heading, "title">, MultiLineDocumentationNode
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Heading;

	/**
	 * {@inheritDoc Heading.id}
	 */
	public readonly id?: string;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	public constructor(content: SingleLineDocumentationNode[], id?: string) {
		super(content);

		this.id = id;
	}

	/**
	 * Generates a `HeadingNode` from the provided string.
	 * @param text - The node contents. Note: this must not contain newline characters.
	 * @param id - See {@link Heading.id}
	 * @param level - See {@link Heading.level}
	 */
	public static createFromPlainText(text: string, id?: string): HeadingNode {
		return new HeadingNode([new PlainTextNode(text)], id);
	}

	/**
	 * Generates a `HeadingNode` from the provided {@link Heading}.
	 */
	public static createFromPlainTextHeading(heading: Heading): HeadingNode {
		return HeadingNode.createFromPlainText(heading.title, heading.id);
	}
}
