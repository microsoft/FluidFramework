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
	// BlockQuote rendering is potentially multi-line, and so if we are inside a table,
	// we need to use HTML syntax.
	if (context.insideTable || context.insideHtml) {
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
