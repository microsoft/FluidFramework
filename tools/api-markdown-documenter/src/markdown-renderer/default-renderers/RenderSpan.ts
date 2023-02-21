/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { SpanNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link SpanNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context.
 */
export function renderSpan(
	node: SpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a multi-line span in a table context, we will render using HTML syntax.
	if (context.insideHtml === true || (!node.singleLine && context.insideTable === true)) {
		renderSpanWithHtmlSyntax(node, writer, context);
	} else {
		renderSpanWithMarkdownSyntax(node, writer, context);
	}
}

function renderSpanWithMarkdownSyntax(
	node: SpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// There is nothing special to a Span from a Markdown perspective.
	// Just a boundary around which we can apply text formatting options.
	renderNodes(node.children, writer, {
		...context,
		...node.textFormatting, // Override any existing formatting as needed
	});
}

function renderSpanWithHtmlSyntax(
	node: SpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.write("<span>");
	renderNodes(node.children, writer, {
		...context,
		...node.textFormatting, // Override any existing formatting as needed
		insideHtml: true,
	});
	writer.write("</span>");
}
