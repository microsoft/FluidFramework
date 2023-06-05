/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationLiteralNode, SingleLineDocumentationNode } from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";

/**
 * Plain text.
 *
 * @remarks
 *
 * Must not contain any line breaks.
 *
 * To include line breaks in your text, use {@link LineBreakNode} in a container node like
 * {@link SpanNode} or {@link ParagraphNode}.
 */
export class PlainTextNode
	implements DocumentationLiteralNode<string>, SingleLineDocumentationNode
{
	/**
	 * Static singleton representing an empty Plain Text node.
	 */
	public static readonly Empty: PlainTextNode = new PlainTextNode("");

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.PlainText;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine = true;

	/**
	 * The text to display.
	 *
	 * @remarks Must not contain newline characters.
	 */
	public readonly value: string;

	/**
	 * Whether or not the text content has already been escaped.
	 */
	public readonly escaped: boolean;

	public constructor(value: string, escaped?: boolean) {
		if (value.includes("\n")) {
			throw new Error("Invalid value: Plain text nodes may not contain newline characters");
		}
		this.value = value;
		this.escaped = escaped ?? false;
	}
}
