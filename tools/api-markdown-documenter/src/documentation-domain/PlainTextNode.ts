/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { LiteralNode, SingleLineElementNode } from "./DocumentionNode";

export class PlainTextNode implements LiteralNode<string>, SingleLineElementNode {
    public readonly type = DocumentNodeType.PlainText;
    public readonly value: string;

    public constructor(value: string) {
        this.value = value;
    }
}
