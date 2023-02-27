/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { OrderedListNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link OrderedListNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within a table context.
 */
export function renderOrderedList(
	node: OrderedListNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a list in a table context, we will render using HTML syntax.
	if (context.insideTable === true || context.insideHtml === true) {
		renderOrderedListWithHtmlSyntax(node, writer, context);
	} else {
		renderOrderedListWithMarkdownSyntax(node, writer, context);
	}
}

function renderOrderedListWithMarkdownSyntax(
	node: OrderedListNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureSkippedLine(); // Lists require leading blank line
	writer.increaseIndent("1. "); // Use numeric indentation for list
	for (const child of node.children) {
		renderNode(child, writer, context);
		writer.ensureNewLine(); // Ensure newline after previous list item
	}
	writer.decreaseIndent();
	writer.ensureSkippedLine(); // Ensure blank line after list
}

function renderOrderedListWithHtmlSyntax(
	node: OrderedListNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.writeLine("<ol>");
	writer.increaseIndent();

	for (const child of node.children) {
		writer.writeLine("<li>");
		writer.increaseIndent();
		renderNode(child, writer, {
			...context,
			insideHtml: true,
		});
		writer.decreaseIndent();
		writer.ensureNewLine(); // Ensure newline after previous list item
		writer.writeLine("</li>");
	}

	writer.decreaseIndent();
	writer.writeLine("</ol>");
}
