/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LineBreakNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";
import { renderNodeWithHtmlSyntax } from "../Utilities.js";

/**
 * Renders a {@link LineBreakNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within a table context.
 */
export function renderLineBreak(
	node: LineBreakNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a line break in a table context, we will render using HTML syntax.
	if (context.insideTable === true) {
		renderNodeWithHtmlSyntax(node, writer, context);
	} else {
		renderLineBreakWithMarkdownSyntax(writer, context);
	}
}

function renderLineBreakWithMarkdownSyntax(
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// In standard Markdown context, a line break is represented by a blank line.
	// However, if we are in a code block context, we instead want to treat it as a simple line break,
	// so as not to alter formatting.
	if (context.insideCodeBlock === true) {
		writer.ensureNewLine();
	} else {
		writer.ensureSkippedLine();
	}
}
