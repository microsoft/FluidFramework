/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { PlainTextNode } from "./PlainTextNode";
import { SpanNode } from "./SpanNode";
import { compareNodeArrays } from "./Utilities";

export type ParagraphChildren =
    | LineBreakNode
    | SingleLineElementNode
    | SpanNode<LineBreakNode | SingleLineElementNode>;

export class ParagraphNode extends ParentNodeBase<ParagraphChildren> {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentNodeType.Paragraph;

    public constructor(children: ParagraphChildren[]) {
        super(children);
    }

    public static createFromPlainText(text: string): ParagraphNode {
        return new ParagraphNode([new PlainTextNode(text)]);
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
