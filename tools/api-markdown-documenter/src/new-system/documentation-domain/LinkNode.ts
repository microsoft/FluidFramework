/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Link, UrlTarget } from "../../Link";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { compareNodeArrays } from "./Utilities";

export class LinkNode
	extends ParentNodeBase<SingleLineElementNode>
	implements SingleLineElementNode, Omit<Link, "text">
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Link;

	/**
	 * {@inheritDoc Link.target}
	 */
	public readonly target: UrlTarget;

	public constructor(content: SingleLineElementNode[], target: UrlTarget) {
		super(content);
		this.target = target;
	}
	/**
	 * Generates a `HeadingNode` from the provided string.
	 * @param text - The node contents. Note: this must not contain newline characters.
	 * @param target - See {@link LinkNode.target}.
	 */
	public static createFromPlainText(text: string, target: UrlTarget): LinkNode {
		return new LinkNode([new PlainTextNode(text)], target);
	}

	public static createFromPlainTextLink(link: Link): LinkNode {
		return this.createFromPlainText(link.text, link.target);
	}

	/**
	 * {@inheritDoc DocumentationNode.equals}
	 */
	public equals(other: DocumentationNode): boolean {
		if (this.type !== other.type) {
			return false;
		}

		const otherLink = other as LinkNode;

		if (this.target !== otherLink.target) {
			return false;
		}

		return compareNodeArrays(this.children, otherLink.children);
	}
}
