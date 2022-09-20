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
import {  UrlTarget } from "../Link";

/**
 * Transformation library from {@link @microsoft/tsdoc#DocNode}_s to {@link DocumentationNode}s.
 */

/**
 * Options for {@link @microsoft/tsdoc#DocNode} transformations.
 */
export interface DocNodeTransformOptions {
    resolveApiReference(codeDestination: DocDeclarationReference): UrlTarget;
}

/**
 * Converts a {@link @microsoft/tsdoc#DocNode} to a {@link DocumentationNode}.
 */
export function transformDocNode(node: DocNode, options: DocNodeTransformOptions): DocumentationNode {
    switch (node.kind) {
        case DocNodeKind.CodeSpan:
            return transformCodeSpan(node as DocCodeSpan, options);
        case DocNodeKind.Paragraph:
            return transformParagraph(node as DocParagraph, options);
        case DocNodeKind.Section:
            return transformSection(node as DocSection, options);
        case DocNodeKind.SoftBreak:
            return LineBreakNode.Singleton;
        case DocNodeKind.PlainText:
            return transformPlainText(node as DocPlainText, options);
        case DocNodeKind.FencedCode:
            return transformFencedCode(node as DocFencedCode, options);
        case DocNodeKind.LinkTag:
            return transformLinkTag(node as DocLinkTag, options);
        default:
            throw new Error(`Unsupported DocNode kind: "${node.kind}".`);
    }
}

/**
 * Converts a {@link @microsoft/tsdoc#DocCodeSpan} to a {@link CodeSpanNode}.
 */
export function transformCodeSpan(node: DocCodeSpan, options: DocNodeTransformOptions): CodeSpanNode {
    return CodeSpanNode.createFromPlainText(node.code);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocParagraph} to a {@link ParagraphNode}.
 */
export function transformParagraph(node: DocParagraph, options: DocNodeTransformOptions): ParagraphNode {
    const children = node.nodes.map((child) => transformDocNode(child, options));
    return new ParagraphNode(children);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocParagraph} to a {@link SpanNode}.
 */
export function transformSection(node: DocSection, options: DocNodeTransformOptions): SpanNode {
    const children = node.nodes.map((child) => transformDocNode(child, options));
    return new SpanNode(children);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformPlainText(node: DocPlainText, options: DocNodeTransformOptions): PlainTextNode {
    return new PlainTextNode(node.text);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformFencedCode(node: DocFencedCode, options: DocNodeTransformOptions): FencedCodeBlockNode {
    return FencedCodeBlockNode.createFromPlainText(node.code, node.language);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformLinkTag(
    node: DocLinkTag,
    options: DocNodeTransformOptions,
): UrlLinkNode | SymbolicLinkNode<DocDeclarationReference> | PlainTextNode {
    const linkTextNode = new PlainTextNode(node.linkText ?? "");

    if (node.codeDestination !== undefined) {
        const urlTarget = options.resolveApiReference(node.codeDestination);
        return new UrlLinkNode({ urlTarget, content: linkTextNode });
    }

    if (node.urlDestination !== undefined) {
        return new UrlLinkNode({ urlTarget: node.urlDestination, content: linkTextNode });
    }

    return linkTextNode;
}
