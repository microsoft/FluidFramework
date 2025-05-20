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
	extends DocumentationParentNodeBase<PhrasingContent>
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

	public constructor(children: PhrasingContent[]) {
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
