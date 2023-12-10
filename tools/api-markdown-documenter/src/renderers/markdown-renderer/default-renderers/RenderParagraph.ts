/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { ParagraphNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";
import { renderNodeWithHtmlSyntax } from "../Utilities";

/**
 * Renders a {@link ParagraphNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as HTML when in a table context.
 */
export function renderParagraph(
	node: ParagraphNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a paragraph in a table context, we will render using HTML syntax.
	if (context.insideTable === true) {
		renderNodeWithHtmlSyntax(node, writer, context);
	} else {
		renderParagraphWithMarkdownSyntax(node, writer, context);
	}
}

function renderParagraphWithMarkdownSyntax(
	node: ParagraphNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before paragraph
	renderNodes(node.children, writer, context);
	writer.ensureSkippedLine(); // Ensure blank line after paragraph
}
