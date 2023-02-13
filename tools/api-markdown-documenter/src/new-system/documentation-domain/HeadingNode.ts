/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Heading } from "../../Heading";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { compareNodeArrays } from "./Utilities";

/**
 *
 */
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

	/**
	 * {@inheritDoc Heading.level}
	 */
	public readonly level?: number;

	public constructor(content: SingleLineElementNode[], id?: string, level?: number) {
		super(content);

		if (level !== undefined && level < 0) {
			throw new Error(`Heading level must be >= 0. Received: ${level}.`);
		}

		this.id = id;
		this.level = level;
	}

	/**
	 * Generates a `HeadingNode` from the provided string.
	 * @param text - The node contents. Note: this must not contain newline characters.
	 * @param id - See {@link Heading.id}
	 * @param level - See {@link Heading.level}
	 */
	public static createFromPlainText(text: string, id?: string, level?: number): HeadingNode {
		return new HeadingNode([new PlainTextNode(text)], id, level);
	}

	/**
	 * Generates a `HeadingNode` from the provided {@link Heading}.
	 */
	public static createFromPlainTextHeading(heading: Heading): HeadingNode {
		return HeadingNode.createFromPlainText(heading.title, heading.id, heading.level);
	}

	/**
	 * {@inheritDoc DocumentationNode.equals}
	 */
	public equals(other: DocumentationNode): boolean {
		if (this.type !== other.type) {
			return false;
		}

		const otherHeading = other as HeadingNode;

		if (this.id !== otherHeading.id) {
			return false;
		}

		if (this.level !== otherHeading.level) {
			return false;
		}

		return compareNodeArrays(this.children, otherHeading.children);
	}
}
