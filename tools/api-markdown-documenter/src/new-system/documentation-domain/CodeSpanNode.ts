/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

/**
 * @example `Foo`
 */
export class CodeSpanNode
	extends ParentNodeBase<SingleLineElementNode>
	implements SingleLineElementNode
{
	public readonly type = DocumentationNodeType.CodeSpan;
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */

	public constructor(children: SingleLineElementNode[]) {
		super(children);
	}

	/**
	 * Generates a `CodeSpanNode` from the provided string.
	 * @param text - The node contents. Note: this must not contain newline characters.
	 */
	public static createFromPlainText(text: string): CodeSpanNode {
		return new CodeSpanNode([new PlainTextNode(text)]);
	}
}
