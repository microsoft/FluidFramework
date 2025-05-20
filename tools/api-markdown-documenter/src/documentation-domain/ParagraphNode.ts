/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import type { PhrasingContent } from "./PhrasingContent.js";
import { createNodesFromPlainText } from "./Utilities.js";

/**
 * A grouping of text content, potentially spanning multiple lines.
 *
 * @example Markdown
 *
 * ```md
 * Some content...
 *
 * Some more content...
 *
 * ```
 *
 * Note that a paragraph in Markdown will always include a trailing newline.
 *
 * @example HTML
 *
 * ```html
 * <p>
 * 	Some content...
 *
 * 	Some more content...
 * </p>
 * ```
 *
 * @public
 */
export class ParagraphNode
	extends DocumentationParentNodeBase<PhrasingContent>
	implements MultiLineDocumentationNode
{
	/**
	 * Static singleton representing an empty Paragraph node.
	 */
	public static readonly Empty = new ParagraphNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Paragraph;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	public constructor(children: PhrasingContent[]) {
		super(children);
	}

	/**
	 * Generates an `ParagraphNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string): ParagraphNode {
		return new ParagraphNode(createNodesFromPlainText(text));
	}
}
