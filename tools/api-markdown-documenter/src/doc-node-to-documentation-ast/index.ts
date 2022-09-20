/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {DocBlock, DocCodeSpan, DocNode, DocNodeKind, DocParagraph, DocPlainText, DocSection, DocSoftBreak} from '@microsoft/tsdoc';
import { CodeSpanNode, DocumentationNode, HierarchicalSectionNode, LineBreakNode, ParagraphNode, PlainTextNode, SpanNode } from '../documentation-domain';

/**
 * Transformation library from DocNode_s to {@link DocumentationNode}s.
 */

/**
 * Converts a {@link @microsoft/tsdoc#DocNode} to a {@link DocumentationNode}.
 */
export function transformDocNode(node: DocNode): DocumentationNode {
    switch (node.kind) {
        case DocNodeKind.CodeSpan:
            return transformCodeSpan(node as DocCodeSpan);
        case DocNodeKind.Paragraph:
            return transformParagraph(node as DocParagraph);
        case DocNodeKind.Section:
            return transformSection(node as DocSection);
        case DocNodeKind.SoftBreak:
            return LineBreakNode.Singleton
        case DocNodeKind.PlainText:
            return transformPlainText(node as DocPlainText);
        default:
            throw new Error(`Unsupported DocNode kind: "${node.kind}".`);
    }
}

/**
 * Converts a {@link @microsoft/tsdoc#DocCodeSpan} to a {@link CodeSpanNode}.
 */
export function transformCodeSpan(node: DocCodeSpan): CodeSpanNode {
    return CodeSpanNode.createFromPlainText(node.code);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocParagraph} to a {@link ParagraphNode}.
 */
export function transformParagraph(node: DocParagraph): ParagraphNode {
    const children = node.nodes.map(transformDocNode);
    return new ParagraphNode(children);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocParagraph} to a {@link SpanNode}.
 */
export function transformSection(node: DocSection): SpanNode {
    const children = node.nodes.map(transformDocNode);
    return new SpanNode(children);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
 export function transformPlainText(node: DocPlainText): PlainTextNode {
    return new PlainTextNode(node.text);
}

