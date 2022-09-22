/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { compareNodeArrays } from "./Utilities";

// TODOs:
// - Do we support a special input for doing nested sub-lists?

export class OrderedListNode extends ParentNodeBase<SingleLineElementNode> {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentNodeType.OrderedList;

    public constructor(children: SingleLineElementNode[]) {
        super(children);
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherList = other as OrderedListNode;

        return compareNodeArrays(this.children, otherList.children);
    }
}
