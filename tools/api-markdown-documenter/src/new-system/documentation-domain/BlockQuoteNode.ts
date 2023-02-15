/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
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
 * ```html
 * <blockquote>
 * 	Foo
 *	<br/>
 * 	Bar
 * </blockquote>
 * ```
 */
export class BlockQuoteNode extends ParentNodeBase {
	/**
	 * Static singleton representing an empty Block Quote node.
	 */
	public static readonly Empty: BlockQuoteNode = new BlockQuoteNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.BlockQuote;

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
