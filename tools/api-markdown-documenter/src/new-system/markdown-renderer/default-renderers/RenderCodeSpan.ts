/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { CodeSpanNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an {@link CodeSpanNode} to generate a markdown code span block.
 *
 * @param node - CodeSpanNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the CodeSpanNode as a string
 */
export function renderCodeSpan(
	node: CodeSpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// If the code span is empty, there is no need to render anything.
	if (!node.hasChildren) {
		return;
	}

	if (context.insideHtml) {
		renderCodeSpanWithHtmlSyntax(node, writer, context);
	} else {
		renderCodeSpanWithMarkdownSyntax(node, writer, context);
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
