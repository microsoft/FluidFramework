/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SpanNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import { renderNodes } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";
import { renderNodeWithHtmlSyntax } from "../Utilities.js";

/**
 * Renders a {@link SpanNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as HTML when content is multi-line while in a table context.
 */
export function renderSpan(
	node: SpanNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a multi-line span in a table context, we will render using HTML syntax.
	if (!node.singleLine && context.insideTable === true) {
		renderNodeWithHtmlSyntax(node, writer, context);
	} else {
		renderSpanWithMarkdownSyntax(node, writer, context);
	}
}

function renderSpanWithMarkdownSyntax(
	node: SpanNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// There is nothing special to a Span from a Markdown perspective.
	// Just a boundary around which we can apply text formatting options.
	renderNodes(node.children, writer, {
		...context,
		...node.textFormatting, // Override any existing formatting as needed
	});
}
