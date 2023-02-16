/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { SpanNode } from "./SpanNode";
import { createNodesFromPlainText } from "./Utilities";

/**
 * Child node kinds supported by {@link ParagraphNode}.
 */
export type ParagraphChildren =
	| LineBreakNode
	| SingleLineElementNode
	| SpanNode<LineBreakNode | SingleLineElementNode>;

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
 */
export class ParagraphNode extends ParentNodeBase<ParagraphChildren> {
	/**
	 * Static singleton representing an empty Paragraph node.
	 */
	public static readonly Empty = new ParagraphNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Paragraph;

	public constructor(children: ParagraphChildren[]) {
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
		for (const node of nodes) {
			children.push(...node.children);
		}

		return new ParagraphNode(children);
	}
}
