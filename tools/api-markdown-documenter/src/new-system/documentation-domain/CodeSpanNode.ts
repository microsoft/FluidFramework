/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

/**
 * Represents a simple, single-line code span.
 *
 * @example Markdown
 *
 * ```md
 * `Foo`
 * ```
 *
 * @example HTML
 *
 * ```html
 * <code>Foo</code>
 * ```
 */
export class CodeSpanNode
	extends ParentNodeBase<SingleLineElementNode>
	implements SingleLineElementNode
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.CodeSpan;

	/**
	 * Static singleton representing an empty Code Span node.
	 */
	public static readonly Empty: CodeSpanNode = new CodeSpanNode([]);

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
