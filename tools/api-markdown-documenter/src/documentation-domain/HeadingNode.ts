/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { LiteralNode, SingleLineElementNode } from "./DocumentionNode";

export class HeadingNode implements LiteralNode<SingleLineElementNode> {
    public readonly type = DocumentNodeType.Markdown;

    public readonly value: SingleLineElementNode;
    public readonly id?: string;

    /**
     * Heading level.
     *
     * @remarks Must be on [0, inf].
     *
     * @defaultValue Automatic based on {@link NestedSection | section} hierarchy.
     */
    public readonly level?: number;

    public constructor(content: SingleLineElementNode, id?: string, level?: number) {
        this.value = content;
    }
}
