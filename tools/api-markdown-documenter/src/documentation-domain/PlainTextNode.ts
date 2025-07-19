/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentationLiteralNodeBase } from "./DocumentationNode.js";

/**
 * Plain text.
 *
 * @remarks
 *
 * Must not contain any line breaks.
 *
 * To include line breaks in your text, use {@link LineBreakNode} in a container node like
 * {@link SpanNode} or {@link ParagraphNode}.
 *
 * @sealed
 * @public
 */
export class PlainTextNode extends DocumentationLiteralNodeBase<string> {
	/**
	 * Static singleton representing an empty Plain Text node.
	 */
	public static readonly Empty: PlainTextNode = new PlainTextNode("");

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = "text";

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public get isEmpty(): boolean {
		return this.value.length === 0;
	}

	// TODO: remove this
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
			throw new Error("Invalid value: Plain text nodes may not contain newline characters");
		}
	}
}
