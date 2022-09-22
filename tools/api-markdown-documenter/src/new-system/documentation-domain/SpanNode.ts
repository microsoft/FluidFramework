/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";
import { compareNodeArrays } from "./Utilities";

export interface TextFormatting {
    /**
     * @defaultValue Inherit
     */
    italic?: boolean;

    /**
     * @defaultValue Inherit
     */
    bold?: boolean;

    /**
     * @defaultValue Inherit
     */
    strikethrough?: boolean;

    // TODO: underline?
    // TODO: what else?
}

export function compareTextFormatting(a: TextFormatting, b: TextFormatting): boolean {
    return a.bold === b.bold && a.italic === b.italic && a.strikethrough === b.strikethrough;
}

export class SpanNode<
    TDocumentNode extends DocumentationNode = DocumentationNode,
> extends ParentNodeBase<TDocumentNode> {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentNodeType.Span;

    /**
     * @defaultValue Inherit
     */
    public readonly textFormatting?: TextFormatting;

    public constructor(children: TDocumentNode[], formatting?: TextFormatting) {
        super(children);
        this.textFormatting = formatting;
    }

    public static createFromPlainText(
        text: string,
        formatting?: TextFormatting,
    ): SingleLineSpanNode<PlainTextNode> {
        return new SpanNode([new PlainTextNode(text)], formatting);
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherSpan = other as SpanNode;

        if (this.textFormatting === undefined) {
            if (otherSpan.textFormatting !== undefined) {
                return false;
            }
        } else {
            if (otherSpan.textFormatting === undefined) {
                return false;
            }
            if (!compareTextFormatting(this.textFormatting, otherSpan.textFormatting)) {
                return false;
            }
        }

        return compareNodeArrays(this.children, otherSpan.children);
    }
}

/**
 * Helper type representing {@link SpanNode}s which strictly contain single-line contents.
 */
export type SingleLineSpanNode<
    TDocumentationNode extends SingleLineElementNode = SingleLineElementNode,
> = SpanNode<TDocumentationNode>;
