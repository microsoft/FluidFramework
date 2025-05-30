/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OrderedListNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import { renderNode } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";
import { renderNodeWithHtmlSyntax } from "../Utilities.js";

/**
 * Renders a {@link OrderedListNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as HTML when in a table context.
 */
export function renderOrderedList(
	node: OrderedListNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a list in a table context, we will render using HTML syntax.
	if (context.insideTable === true) {
		renderNodeWithHtmlSyntax(node, writer, context);
	} else {
		renderOrderedListWithMarkdownSyntax(node, writer, context);
	}
}

function renderOrderedListWithMarkdownSyntax(
	node: OrderedListNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.ensureSkippedLine(); // Lists require leading blank line
	writer.increaseIndent("1. "); // Use numeric indentation for list
	for (const child of node.children) {
		if (child.singleLine) {
			renderNode(child, writer, context);
			writer.ensureNewLine(); // Ensure newline after previous list item
		} else {
			// If the contents of a child node cannot fit on a single line using Markdown syntax,
			// we will fall back to HTML syntax.
			renderNodeWithHtmlSyntax(child, writer, context);
		}
	}
	writer.decreaseIndent();
	writer.ensureSkippedLine(); // Ensure blank line after list
}
