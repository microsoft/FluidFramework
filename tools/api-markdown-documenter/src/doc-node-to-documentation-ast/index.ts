/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    DocCodeSpan,
    DocDeclarationReference,
    DocFencedCode,
    DocLinkTag,
    DocNode,
    DocNodeKind,
    DocParagraph,
    DocPlainText,
    DocSection,
} from "@microsoft/tsdoc";

import {
    CodeSpanNode,
    DocumentationNode,
    FencedCodeBlockNode,
    LineBreakNode,
    ParagraphNode,
    PlainTextNode,
    SpanNode,
    SymbolicLinkNode,
    UrlLinkNode,
} from "../documentation-domain";

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
            return LineBreakNode.Singleton;
        case DocNodeKind.PlainText:
            return transformPlainText(node as DocPlainText);
        case DocNodeKind.FencedCode:
            return transformFencedCode(node as DocFencedCode);
        case DocNodeKind.LinkTag:
            return transformLinkTag(node as DocLinkTag);
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

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformFencedCode(node: DocFencedCode): FencedCodeBlockNode {
    return FencedCodeBlockNode.createFromPlainText(node.code, node.language);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformLinkTag(
    node: DocLinkTag,
): UrlLinkNode | SymbolicLinkNode<DocDeclarationReference> | PlainTextNode {
    const linkTextNode = new PlainTextNode(node.linkText ?? "");

    if (node.codeDestination !== undefined) {
        return new SymbolicLinkNode({ symbolTarget: node.codeDestination, content: linkTextNode });
    }

    if (node.urlDestination !== undefined) {
        return new UrlLinkNode({ urlTarget: node.urlDestination, content: linkTextNode });
    }

    return linkTextNode;
}
