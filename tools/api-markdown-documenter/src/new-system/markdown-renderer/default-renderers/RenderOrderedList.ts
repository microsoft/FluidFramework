/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { OrderedListNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an OrderedListNode to generate an ordered list in markdown
 *
 * @param node - OrderedListNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the OrderedListNode as a string
 */
export function renderOrderedList(
	node: OrderedListNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideTable || context.insideHtml) {
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
	writer.increaseIndent("1."); // Use numeric indentation for list
	for (const child of node.children) {
		renderNode(child, writer, context);
		writer.ensureNewLine(); // Ensure newline after previous list item
	}
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
		renderNode(child, writer, context);
		writer.ensureNewLine(); // Ensure newline after previous list item
		writer.decreaseIndent();
		writer.writeLine("</li>");
	}

	writer.decreaseIndent();
	writer.writeLine("</ol>");
}
