/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { SpanNode } from "./SpanNode";
import { createNodesFromPlainText } from "./Utilities";

export type ParagraphChildren =
	| LineBreakNode
	| SingleLineElementNode
	| SpanNode<LineBreakNode | SingleLineElementNode>;

export class ParagraphNode extends ParentNodeBase<ParagraphChildren> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Paragraph;

	/**
	 * Empty paragraph singleton.
	 */
	public static readonly Empty = new ParagraphNode([]);

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
