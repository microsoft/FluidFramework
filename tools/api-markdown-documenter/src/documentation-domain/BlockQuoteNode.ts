/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNode, MultiLineDocumentationNode, ParentNodeBase } from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";
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
export class BlockQuoteNode extends ParentNodeBase implements MultiLineDocumentationNode {
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
