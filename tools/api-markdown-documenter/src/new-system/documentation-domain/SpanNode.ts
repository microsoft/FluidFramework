/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

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

export class SpanNode<
    TDocumentNode extends DocumentationNode = DocumentationNode,
> extends ParentNodeBase<TDocumentNode> {
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
}

/**
 * Helper type representing {@link SpanNode}s which strictly contain single-line contents.
 */
export type SingleLineSpanNode<
    TDocumentationNode extends SingleLineElementNode = SingleLineElementNode,
> = SpanNode<TDocumentationNode>;
