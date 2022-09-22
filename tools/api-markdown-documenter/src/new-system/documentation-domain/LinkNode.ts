/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Link, UrlTarget } from "../../Link";
import { DocumentNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

export class LinkNode
    extends ParentNodeBase<SingleLineElementNode>
    implements SingleLineElementNode
{
    public readonly type = DocumentNodeType.UrlLink;

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
}
