/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

/**
 * @example `Foo`
 */
export class CodeSpanNode
    extends ParentNodeBase<SingleLineElementNode>
    implements SingleLineElementNode
{
    public readonly type = DocumentNodeType.CodeSpan;

    public constructor(children: SingleLineElementNode[]) {
        super(children);
    }

    public static createFromPlainText(text: string): CodeSpanNode {
        return new CodeSpanNode([new PlainTextNode(text)]);
    }
}
