/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationLiteralNodeBase } from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import { PlainTextNode } from "./PlainTextNode.js";

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
 *
 * @sealed
 * @public
 */
export class CodeSpanNode extends DocumentationLiteralNodeBase<PlainTextNode> {
	/**
	 * Static singleton representing an empty Code Span node.
	 */
	public static readonly Empty: CodeSpanNode = new CodeSpanNode(PlainTextNode.Empty);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.CodeSpan;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine = true;

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public get isEmpty(): boolean {
		return this.value.isEmpty;
	}

	public constructor(value: PlainTextNode) {
		super(value);
	}

	/**
	 * Generates a `CodeSpanNode` from the provided string.
	 * @param text - The node contents. Note: this must not contain newline characters.
	 */
	public static createFromPlainText(text: string): CodeSpanNode {
		return new CodeSpanNode(new PlainTextNode(text));
	}
}
