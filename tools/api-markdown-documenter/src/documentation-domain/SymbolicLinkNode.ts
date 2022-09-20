/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { LiteralNode, SingleLineElementNode } from "./DocumentionNode";

export interface SymbolicLink<TLinkTarget = unknown> {
    symbolTarget: TLinkTarget;
    content?: SingleLineElementNode;
}

export class SymbolicLinkNode<TLinkTarget = unknown>
    implements LiteralNode<SymbolicLink>, SingleLineElementNode
{
    public readonly type = DocumentNodeType.SymbolicLink;
    public readonly value: SymbolicLink<TLinkTarget>;

    public constructor(link: SymbolicLink<TLinkTarget>) {
        this.value = link;
    }
}
