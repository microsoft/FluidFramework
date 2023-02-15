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
 * @param context - See {@link MarkdownRenderContext}.
 * @returns The markdown representation of the BlockQuoteNode as a string
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
