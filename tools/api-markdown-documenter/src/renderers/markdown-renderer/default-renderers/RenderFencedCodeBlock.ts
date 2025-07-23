/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FencedCodeBlockNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";
import { renderNodeWithHtmlSyntax } from "../Utilities.js";

/**
 * Renders a {@link FencedCodeBlockNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as HTML when in a table context.
 */
export function renderFencedCodeBlock(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a line break in a table context, we will render using HTML syntax.
	if (context.insideTable === true) {
		renderNodeWithHtmlSyntax(node, writer, context);
	} else {
		renderFencedCodeBlockWithMarkdownSyntax(node, writer);
	}
}

function renderFencedCodeBlockWithMarkdownSyntax(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
): void {
	writer.ensureSkippedLine(); // Code blocks require a leading blank line
	writer.write("```");
	writer.writeLine(node.language);
	writer.write(node.value);
	writer.ensureNewLine();
	writer.ensureNewLine(); // Ensure newline after body content
	writer.writeLine("```");
	writer.ensureSkippedLine(); // Code blocks require a trailing blank line
}
