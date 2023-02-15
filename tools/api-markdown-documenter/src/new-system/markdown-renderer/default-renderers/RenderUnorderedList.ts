/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { UnorderedListNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an UnorderedListNode to generate an ordered list in markdown
 *
 * @param listNode - UnorderedListNode to convert into markdown
 * @param context - See {@link MarkdownRenderContext}.
 * @returns The markdown representation of the UnorderedListNode as a string
 */

/**
 * Recursively enumerates an OrderedListNode to generate an ordered list in markdown
 *
 * @param node - OrderedListNode to convert into markdown
 * @param context - See {@link MarkdownRenderContext}.
 * @returns The markdown representation of the OrderedListNode as a string
 */
export function renderUnorderedList(
	node: UnorderedListNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideTable || context.insideHtml) {
		renderUnorderedListWithHtmlSyntax(node, writer, context);
	} else {
		renderUnorderedListWithMarkdownSyntax(node, writer, context);
	}
}

function renderUnorderedListWithMarkdownSyntax(
	node: UnorderedListNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureSkippedLine(); // Lists require leading blank line
	writer.increaseIndent("- ");
	for (const child of node.children) {
		renderNode(child, writer, context);
		writer.ensureNewLine(); // Ensure newline after previous list item
	}
	writer.decreaseIndent();
	writer.ensureSkippedLine(); // Ensure blank line after list
}

function renderUnorderedListWithHtmlSyntax(
	node: UnorderedListNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.writeLine("<ul>");
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
	writer.writeLine("</ul>");
}
