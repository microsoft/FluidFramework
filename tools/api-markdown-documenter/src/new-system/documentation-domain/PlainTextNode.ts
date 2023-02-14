/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { LiteralNode, SingleLineElementNode } from "./DocumentionNode";

/**
 * Plain text.
 *
 * @remarks
 *
 * Must not contain any line breaks.
 * To include line breaks in your text, see {@link LineBreakNode}.
 */
export class PlainTextNode implements LiteralNode<string>, SingleLineElementNode {
	/**
	 * Static singleton representing an empty Plain Text node.
	 */
	public static readonly Empty: PlainTextNode = new PlainTextNode("");

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.PlainText;

	/**
	 * The text to display.
	 *
	 * @remarks Must not contain newline characters.
	 */
	public readonly value: string;

	public constructor(value: string) {
		if (value.includes("\n")) {
			throw new Error("Invalid value: Plain text nodes may not contain newline characters");
		}
		this.value = value;
	}
}
