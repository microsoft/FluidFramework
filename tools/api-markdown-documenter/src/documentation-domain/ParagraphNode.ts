/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { SpanNode } from "./SpanNode";

export type ParagraphChildren =
    | LineBreakNode
    | SingleLineElementNode
    | SpanNode<LineBreakNode | SingleLineElementNode>;

export class ParagraphNode extends ParentNodeBase<ParagraphChildren> {
    public readonly type = DocumentNodeType.Paragraph;

    public constructor(children: ParagraphChildren[]) {
        super(children);
    }
}
