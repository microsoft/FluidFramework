/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { CodeSpanNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link CodeSpanNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context.
 */
export function renderCodeSpan(
	node: CodeSpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideHtml === true) {
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
