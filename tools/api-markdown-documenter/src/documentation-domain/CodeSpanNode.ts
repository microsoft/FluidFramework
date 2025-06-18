/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationLiteralNodeBase } from "./DocumentationNode.js";

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
export class CodeSpanNode extends DocumentationLiteralNodeBase<string> {
	/**
	 * Static singleton representing an empty Code Span node.
	 */
	public static readonly Empty: CodeSpanNode = new CodeSpanNode("");

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "codeSpan";

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public get isEmpty(): boolean {
		return this.value.length === 0;
	}

	public constructor(value: string) {
		super(value);
	}

	/**
	 * Generates a `CodeSpanNode` from the provided string.
	 * @param text - The node contents. Note: this must not contain newline characters.
	 */
	public static createFromPlainText(text: string): CodeSpanNode {
		return new CodeSpanNode(text);
	}
}
