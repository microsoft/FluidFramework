import {
    DocCodeSpan,
    DocFencedCode,
    DocNode,
    DocNodeKind,
    DocParagraph,
    DocPlainText,
    DocSection,
} from "@microsoft/tsdoc";
import { code, paragraph, text } from "mdast-builder";
import { Node as AstNode, Parent as AstParentNode } from "unist";

import { SectionAstNode, buildSection } from "./AstNode";

export function docNodeToMdAst(docNode: DocNode): AstNode {
    switch (docNode.kind) {
        case DocNodeKind.CodeSpan:
            return docCodeSpanToMdAst(docNode as DocCodeSpan);
        case DocNodeKind.FencedCode:
            return docFencedCodeToMdAst(docNode as DocFencedCode);
        case DocNodeKind.Paragraph:
            return docParagraphToMdAst(docNode as DocParagraph);
        case DocNodeKind.PlainText:
            return docPlainTextToMdAst(docNode as DocPlainText);
        case DocNodeKind.Section:
            return docSectionToMdAst(docNode as DocSection);
        default:
            throw new Error("TODO");
    }
}

export function docSectionToMdAst(docSection: DocSection): SectionAstNode {
    return buildSection(docSection.nodes.map((docNode) => docNodeToMdAst(docNode)));
}

export function docParagraphToMdAst(docParagraph: DocParagraph): AstParentNode {
    return paragraph(docParagraph.nodes.map((docNode) => docNodeToMdAst(docNode)));
}

export function docPlainTextToMdAst(docPlainText: DocPlainText): AstNode {
    return text(docPlainText.text);
}

export function docCodeSpanToMdAst(docCodeSpan: DocCodeSpan): AstNode {
    return code("typescript", docCodeSpan.code);
}

export function docFencedCodeToMdAst(docFencedCode: DocFencedCode): AstNode {
    return code(docFencedCode.language, docFencedCode.code);
}
