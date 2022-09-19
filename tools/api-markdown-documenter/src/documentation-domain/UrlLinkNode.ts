/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { LiteralNode, SingleLineElementNode } from "./DocumentionNode";

export interface UrlLink {
    urlTarget: string;
    content?: SingleLineElementNode;
}

export class UrlLinkNode implements LiteralNode<UrlLink>, SingleLineElementNode {
    public readonly type = DocumentNodeType.UrlLink;
    public readonly value: UrlLink;

    public constructor(link: UrlLink) {
        this.value = link;
    }
}
