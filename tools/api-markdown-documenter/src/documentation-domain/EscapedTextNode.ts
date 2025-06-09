/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationLiteralNodeBase } from "./DocumentationNode.js";

/**
 * Escaped plain text.
 *
 * @remarks
 *
 * This is an "unsafe" type for representing text that has already been escaped for use in an HTML context (including Markdown).
 * Use of this type should be avoided unless you are certain that the text has been properly escaped.
 * This type only exists because TSDoc's format includes escaped text that is intended to be rendered as raw HTML.
 *
 * Must not contain any line breaks.
 * To include line breaks in your text, use {@link LineBreakNode} in a container node like
 * {@link SpanNode} or {@link ParagraphNode}.
 *
 * @sealed
 * @public
 */
export class EscapedTextNode extends DocumentationLiteralNodeBase<string> {
	/**
	 * Static singleton representing an empty Plain Text node.
	 */
	public static readonly Empty: EscapedTextNode = new EscapedTextNode("");

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "escapedText";

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine = true;

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public get isEmpty(): boolean {
		return this.value.length === 0;
	}

	/**
	 * The text to display.
	 *
	 * @remarks Must not contain newline characters.
	 */
	public get text(): string {
		return this.value;
	}

	public constructor(text: string) {
		super(text);

		if (text.includes("\n")) {
			throw new Error("Invalid value: Text nodes may not contain newline characters");
		}
	}
}
