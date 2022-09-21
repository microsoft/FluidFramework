/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Heading } from "../Heading";
import { DocumentNodeType } from "./DocumentationNodeType";
import { LiteralNode, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

export class HeadingNode implements LiteralNode<SingleLineElementNode> {
    public readonly type = DocumentNodeType.Markdown;

    public readonly value: SingleLineElementNode;
    public readonly id?: string;

    /**
     * Heading level.
     *
     * @remarks Must be on [0, ∞).
     *
     * @defaultValue Automatic based on {@link HierarchicalSectionNode | section} hierarchy.
     */
    public readonly level?: number;

    public constructor(content: SingleLineElementNode, id?: string, level?: number) {
        if (level !== undefined && level < 0) {
            throw new Error(`Heading level must be >= 0. Received: ${level}.`);
        }

        this.value = content;
        this.id = id;
        this.level = level;
    }

    public static createFromPlainText(text: string, id?: string, level?: number): HeadingNode {
        return new HeadingNode(new PlainTextNode(text), id, level);
    }

    public static createFromHeading(heading: Heading): HeadingNode {
        return HeadingNode.createFromPlainText(heading.title, heading.id, heading.level);
    }
}
