/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type DocumentationNode,
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { createNodesFromPlainText } from "./Utilities";

/**
 * A quotation block.
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
 *
 * @public
 */
export class BlockQuoteNode
	extends DocumentationParentNodeBase
	implements MultiLineDocumentationNode
{
	/**
	 * Static singleton representing an empty Block Quote node.
	 */
	public static readonly Empty: BlockQuoteNode = new BlockQuoteNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.BlockQuote;

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
	 * Generates a `BlockQuoteNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string): BlockQuoteNode {
		return new BlockQuoteNode(createNodesFromPlainText(text));
	}
}
