/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Heading } from "../../Heading";
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { compareNodeArrays } from "./Utilities";

export class HeadingNode extends ParentNodeBase<SingleLineElementNode> {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentNodeType.Heading;

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
        super([content]);

        if (level !== undefined && level < 0) {
            throw new Error(`Heading level must be >= 0. Received: ${level}.`);
        }

        this.id = id;
        this.level = level;
    }

    public static createFromPlainText(text: string, id?: string, level?: number): HeadingNode {
        return new HeadingNode(new PlainTextNode(text), id, level);
    }

    public static createFromHeading(heading: Heading): HeadingNode {
        return HeadingNode.createFromPlainText(heading.title, heading.id, heading.level);
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherHeading = other as HeadingNode;

        if (this.id !== otherHeading.id) {
            return false;
        }

        if (this.level !== otherHeading.level) {
            return false;
        }

        return compareNodeArrays(this.children, otherHeading.children);
    }
}
