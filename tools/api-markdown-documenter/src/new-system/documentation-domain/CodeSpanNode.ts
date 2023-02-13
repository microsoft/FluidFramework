/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { compareNodeArrays } from "./Utilities";

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

	/**
	 * {@inheritDoc DocumentationNode.equals}
	 */
	public equals(other: DocumentationNode): boolean {
		if (this.type !== other.type) {
			return false;
		}

		const otherCodeSpan = other as CodeSpanNode;

		return compareNodeArrays(this.children, otherCodeSpan.children);
	}
}
