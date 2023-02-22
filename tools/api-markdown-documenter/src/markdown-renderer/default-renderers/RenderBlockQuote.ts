/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { BlockQuoteNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link BlockQuoteNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within a table context.
 */
export function renderBlockQuote(
	node: BlockQuoteNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a block quote in a table context, we will render using HTML syntax.
	if (context.insideTable === true || context.insideHtml === true) {
		renderBlockQuoteWithHtmlSyntax(node, writer, context);
	} else {
		renderBlockQuoteWithMarkdownSyntax(node, writer, context);
	}
}

function renderBlockQuoteWithMarkdownSyntax(
	node: BlockQuoteNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureSkippedLine(); // Block quotes require a leading blank line
	writer.increaseIndent("> ");
	renderNodes(node.children, writer, context);
	writer.decreaseIndent();
	writer.ensureSkippedLine(); // Block quotes require a trailing blank line
}

function renderBlockQuoteWithHtmlSyntax(
	node: BlockQuoteNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureNewLine();
	writer.writeLine("<blockquote>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideHtml: true,
	});
	writer.ensureNewLine();
	writer.decreaseIndent();
	writer.writeLine("</blockquote>");
}
