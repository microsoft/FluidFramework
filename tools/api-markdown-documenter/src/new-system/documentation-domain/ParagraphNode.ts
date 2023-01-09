/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { SpanNode } from "./SpanNode";
import { compareNodeArrays, createNodesFromPlainText } from "./Utilities";

export type ParagraphChildren =
    | LineBreakNode
    | SingleLineElementNode
    | SpanNode<LineBreakNode | SingleLineElementNode>;

export class ParagraphNode extends ParentNodeBase<ParagraphChildren> {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentationNodeType.Paragraph;

    public constructor(children: ParagraphChildren[]) {
        super(children);
    }

    /**
     * Generates an `ParagraphNode` from the provided string.
     * @param text - The node contents.
     */
    public static createFromPlainText(text: string): ParagraphNode {
        return new ParagraphNode(createNodesFromPlainText(text));
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherParagraph = other as ParagraphNode;

        return compareNodeArrays(this.children, otherParagraph.children);
    }
}
