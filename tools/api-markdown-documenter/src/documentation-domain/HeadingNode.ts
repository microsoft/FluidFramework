/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Heading } from "../Heading";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

export class HeadingNode
	extends ParentNodeBase<SingleLineElementNode>
	implements Omit<Heading, "title">
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Heading;

	/**
	 * {@inheritDoc Heading.id}
	 */
	public readonly id?: string;

	public constructor(content: SingleLineElementNode[], id?: string) {
		super(content);

		this.id = id;
	}

	/**
	 * Generates a `HeadingNode` from the provided string.
	 * @param text - The node contents. Note: this must not contain newline characters.
	 * @param id - See {@link Heading.id}
	 * @param level - See {@link Heading.level}
	 */
	public static createFromPlainText(text: string, id?: string): HeadingNode {
		return new HeadingNode([new PlainTextNode(text)], id);
	}

	/**
	 * Generates a `HeadingNode` from the provided {@link Heading}.
	 */
	public static createFromPlainTextHeading(heading: Heading): HeadingNode {
		return HeadingNode.createFromPlainText(heading.title, heading.id);
	}
}
