/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { LiteralNode, SingleLineElementNode } from "./DocumentionNode";

export type SymbolicLinkTarget = unknown; // TODO: better typing here?

export interface SymbolicLink {
    symbolTarget: SymbolicLinkTarget;
    content?: SingleLineElementNode;
}

export class SymbolicLinkNode implements LiteralNode<SymbolicLink>, SingleLineElementNode {
    public readonly type = DocumentNodeType.SymbolicLink;
    public readonly value: SymbolicLink;

    public constructor(link: SymbolicLink) {
        this.value = link;
    }
}
