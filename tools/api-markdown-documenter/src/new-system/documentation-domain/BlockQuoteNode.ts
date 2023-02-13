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
 * @example
 * ```md
 * > Foo
 * >
 * > Bar
 * ```
 */
export class BlockQuoteNode extends ParentNodeBase {
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
