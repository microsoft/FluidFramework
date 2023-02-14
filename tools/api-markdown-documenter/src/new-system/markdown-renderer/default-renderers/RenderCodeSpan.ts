/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { CodeSpanNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an CodeSpanNode to generate a markdown code span block.
 *
 * @param codeSpanNode - CodeSpanNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the CodeSpanNode as a string
 */
export function renderCodeSpan(
	codeSpanNode: CodeSpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideTable || context.insideHtml) {
		renderCodeSpanWithHtmlSyntax(codeSpanNode, writer, context);
	} else {
		renderCodeSpanWithMarkdownSyntax(codeSpanNode, writer, context);
	}
}

function renderCodeSpanWithMarkdownSyntax(
	codeSpanNode: CodeSpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.write("`");
	renderNodes(codeSpanNode.children, writer, {
		...context,
		insideCodeBlock: true,
	});
	writer.write("`");
}

function renderCodeSpanWithHtmlSyntax(
	codeSpanNode: CodeSpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.write("<code>");
	renderNodes(codeSpanNode.children, writer, {
		...context,
		insideCodeBlock: true,
		insideHtml: true,
	});
	writer.write("</code>");
}
