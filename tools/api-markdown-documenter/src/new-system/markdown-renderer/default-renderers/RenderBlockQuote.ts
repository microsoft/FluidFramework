/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { BlockQuoteNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an {@link BlockQuoteNode} to generate block quote in Markdown.
 *
 * @param node - BlockQuoteNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the BlockQuoteNode as a string
 */
export function renderBlockQuote(
	node: BlockQuoteNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// If the block quote is empty, there is no need to render anything.
	if (!node.hasChildren) {
		return;
	}

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
	writer.writeLine("<blockquote>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideHtml: true,
	});
	writer.decreaseIndent();
	writer.writeLine("</blockquote>");
}
