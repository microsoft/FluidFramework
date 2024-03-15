/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type DocumentationNode,
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import { LineBreakNode } from "./LineBreakNode.js";
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
	extends DocumentationParentNodeBase
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

	public constructor(children: DocumentationNode[]) {
		super(children);
	}

	/**
	 * Generates an `ParagraphNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string): ParagraphNode {
		return new ParagraphNode(createNodesFromPlainText(text));
	}

	/**
	 * Combines the contents of 1 or more {@link ParagraphNode}s into a single node.
	 */
	public static combine(...nodes: ParagraphNode[]): ParagraphNode {
		if (nodes.length === 0) {
			return ParagraphNode.Empty;
		}

		if (nodes.length === 1) {
			return nodes[0];
		}

		const children: DocumentationNode[] = [];
		for (let i = 0; i < nodes.length; i++) {
			children.push(...nodes[i].children);
			// Ensure adjacent paragraphs' contents are separated by a line break
			if (i < nodes.length - 1) {
				children.push(LineBreakNode.Singleton);
			}
		}

		return new ParagraphNode(children);
	}
}
