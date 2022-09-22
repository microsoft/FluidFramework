/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";

// TODOs:
// - Do we support a special input for doing nested sub-lists?

export class UnorderedListNode extends ParentNodeBase<SingleLineElementNode> {
    public readonly type = DocumentNodeType.UnorderedList;

    public constructor(children: SingleLineElementNode[]) {
        super(children);
    }
}
