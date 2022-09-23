/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, LiteralNode, SingleLineElementNode } from "./DocumentionNode";

export class PlainTextNode implements LiteralNode<string>, SingleLineElementNode {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentationNodeType.PlainText;
    public readonly value: string;

    public constructor(value: string) {
        if (value.indexOf("\n") >= 0) {
            throw new Error("Invalid value: Plain text nodes may not contain newline characters");
        }
        this.value = value;
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        return this.value === (other as PlainTextNode).value;
    }
}
