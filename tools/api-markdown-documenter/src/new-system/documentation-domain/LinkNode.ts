/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Link, UrlTarget } from "../../Link";
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { compareNodeArrays } from "./Utilities";

export class LinkNode
    extends ParentNodeBase<SingleLineElementNode>
    implements SingleLineElementNode
{
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentNodeType.Link;

    public readonly target: UrlTarget;

    public constructor(content: SingleLineElementNode[], target: UrlTarget) {
        super(content);
        this.target = target;
    }

    public static createFromPlainText(text: string, target: UrlTarget): LinkNode {
        return new LinkNode([new PlainTextNode(text)], target);
    }

    public static createFromPlainTextLink(link: Link): LinkNode {
        return this.createFromPlainText(link.text, link.url);
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
