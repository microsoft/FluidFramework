/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { createNodesFromPlainText } from "./Utilities";

/**
 * TODO
 *
 * @example Markdown
 *
 * ```md
 * > Foo
 * >
 * > Bar
 * ```
 *
 * @example HTML
 *
 * <blockquote>
 * 	Foo
 *	<br/>
 * 	Bar
 * </blockquote>
 */
export class BlockQuoteNode extends ParentNodeBase {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.BlockQuote;

	/**
	 * Static singleton representing an empty Block Quote node.
	 */
	public static readonly Empty: BlockQuoteNode = new BlockQuoteNode([PlainTextNode.Empty]);

	public constructor(children: DocumentationNode[]) {
		super(children);
	}

	/**
	 * Generates a `BlockQuoteNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string): BlockQuoteNode {
		return new BlockQuoteNode(createNodesFromPlainText(text));
	}
}
