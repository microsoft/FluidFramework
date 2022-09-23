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

import { UrlTarget } from "../../Link";
import { Logger } from "../../Logging";
import {
    CodeSpanNode,
    DocumentationNodeType,
    DocumentationNode,
    FencedCodeBlockNode,
    LineBreakNode,
    LinkNode,
    ParagraphNode,
    PlainTextNode,
    SingleLineSpanNode,
    SpanNode,
} from "../documentation-domain";

/**
 * Transformation library from {@link @microsoft/tsdoc#DocNode}_s to {@link DocumentationNode}s.
 */

/**
 * Options for {@link @microsoft/tsdoc#DocNode} transformations.
 */
export interface DocNodeTransformOptions {
    /**
     * Callback for resolving symbolic links to API items.
     *
     * @returns The appropriate URL target if the reference can be resolved. Otherwise, `undefined`.
     */
    readonly resolveApiReference: (
        codeDestination: DocDeclarationReference,
    ) => UrlTarget | undefined;

    /**
     * Optional policy for logging system information.
     */
    readonly logger?: Logger;
}

/**
 * Converts a {@link @microsoft/tsdoc#DocNode} to a {@link DocumentationNode}.
 */
export function transformDocNode(
    node: DocNode,
    options: DocNodeTransformOptions,
): DocumentationNode {
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
export function transformCodeSpan(
    node: DocCodeSpan,
    options: DocNodeTransformOptions,
): CodeSpanNode {
    return CodeSpanNode.createFromPlainText(node.code);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocParagraph} to a {@link ParagraphNode}.
 */
export function transformParagraph(
    node: DocParagraph,
    options: DocNodeTransformOptions,
): ParagraphNode {
    return createParagraph(node.nodes, options);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocSection} to a {@link ParagraphNode}.
 */
export function transformSection(
    node: DocSection,
    options: DocNodeTransformOptions,
): ParagraphNode {
    return createParagraph(node.nodes, options);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformPlainText(
    node: DocPlainText,
    options: DocNodeTransformOptions,
): PlainTextNode {
    return new PlainTextNode(node.text);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformFencedCode(
    node: DocFencedCode,
    options: DocNodeTransformOptions,
): FencedCodeBlockNode {
    return FencedCodeBlockNode.createFromPlainText(node.code, node.language);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformLinkTag(
    node: DocLinkTag,
    options: DocNodeTransformOptions,
): LinkNode | SingleLineSpanNode {
    if (node.codeDestination !== undefined) {
        // If link text was not provided, use the name of the referenced element.
        const linkText = node.linkText ?? node.codeDestination.emitAsTsdoc();

        const urlTarget = options.resolveApiReference(node.codeDestination);
        return urlTarget === undefined
            ? // If the code link could not be resolved, print the unresolved text in italics.
              SpanNode.createFromPlainText(linkText, { italic: true })
            : LinkNode.createFromPlainText(linkText, urlTarget);
    }

    if (node.urlDestination !== undefined) {
        // If link text was not provided, use the name of the referenced element.
        const linkText = node.linkText ?? node.urlDestination;

        return LinkNode.createFromPlainText(linkText, node.urlDestination);
    }

    throw new Error(
        `DocLinkTag contained neither a URL destination nor a code destination, which is not expected.`,
    );
}

/**
 * Helper function for creating {@link {ParagraphNode}s from input nodes that simply wrap child contents.
 *
 * Also performs the following cleanup steps:
 *
 * 1. Remove leading and trailing line breaks within the paragraph (see
 * {@link trimLeadingAndTrailingLineBreaks}).
 *
 * 2. If there is only a single resulting child and it is a paragraph, return it rather than wrapping
 * it in another paragraph.
 */
function createParagraph(
    children: readonly DocNode[],
    options: DocNodeTransformOptions,
): ParagraphNode {
    let transformedChildren = transformChildren(children, options);

    // Trim leading and trailing line breaks, which are effectively redudant
    transformedChildren = trimLeadingAndTrailingLineBreaks(transformedChildren);

    // To reduce unecessary hierarchy, if the only child of this paragraph is a single paragraph,
    // return it, rather than wrapping it.
    if (
        transformedChildren.length === 1 &&
        transformedChildren[0].type === DocumentationNodeType.Paragraph
    ) {
        return transformedChildren[0] as ParagraphNode;
    }

    return new ParagraphNode(transformedChildren);
}

/**
 * Transforms the provided list of child elements, and performs the following cleanup steps:
 *
 * 1. Collapses groups of adjacent newline nodes to reduce clutter.
 *
 * 2. Remove line break nodes adjacent to paragraph nodes.
 */
function transformChildren(
    children: readonly DocNode[],
    options: DocNodeTransformOptions,
): DocumentationNode[] {
    // Transform child items into Documentation domain
    const transformedChildren = children.map((child) => transformDocNode(child, options));

    // Collapse groups of adjacent line breaks to reduce unecessary clutter in the output.
    let filteredChildren = collapseAdjacentLineBreaks(transformedChildren);

    // Remove line breaks adjacent to paragraphs, as they are redundant
    filterNewlinesAdjacentToParagraphs(filteredChildren);

    return filteredChildren;
}

/**
 * Collapses adjacent groups of 1+ line break nodes into a single line break node to reduce clutter
 * in output tree.
 */
function collapseAdjacentLineBreaks(nodes: readonly DocumentationNode[]): DocumentationNode[] {
    if (nodes.length === 0) {
        return [];
    }

    const result: DocumentationNode[] = [];
    let onNewline = false;
    for (const node of nodes) {
        if (node.type === DocumentationNodeType.LineBreak) {
            if (onNewline) {
                continue;
            } else {
                onNewline = true;
                result.push(node);
            }
        } else {
            onNewline = false;
            result.push(node);
        }
    }

    return result;
}

/**
 * Trims an line break nodes found at the beginning or end of the list.
 *
 * @remarks Useful for cleaning up {@link ParagraphNode} child contents, since leading and trailing
 * newlines are effectively redundant.
 */
function trimLeadingAndTrailingLineBreaks(
    nodes: readonly DocumentationNode[],
): DocumentationNode[] {
    if (nodes.length === 0) {
        return [];
    }

    let startIndex = 0;
    let endIndex = nodes.length - 1;

    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type === DocumentationNodeType.LineBreak) {
            startIndex++;
        } else {
            break;
        }
    }

    for (let i = nodes.length - 1; i > startIndex; i--) {
        if (nodes[i].type === DocumentationNodeType.LineBreak) {
            endIndex--;
        } else {
            break;
        }
    }

    return nodes.slice(startIndex, endIndex + 1);
}

/**
 * Filters out line break nodes that are adjacent to paragraph nodes.
 * Since paragraph nodes inherently create line breaks on either side, these nodes are redundant and
 * clutter the output tree.
 */
function filterNewlinesAdjacentToParagraphs(
    nodes: readonly DocumentationNode[],
): DocumentationNode[] {
    if (nodes.length === 0) {
        return [];
    }

    const result: DocumentationNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type === DocumentationNodeType.LineBreak) {
            const previousIsParagraph =
                i > 0 ? nodes[i - 1].type === DocumentationNodeType.Paragraph : false;
            const nextIsParagraph =
                i < nodes.length - 1 ? nodes[i + 1].type === DocumentationNodeType.Paragraph : false;
            if (previousIsParagraph || nextIsParagraph) {
                continue;
            }
        }
        result.push(nodes[i]);
    }
    return result;
}
