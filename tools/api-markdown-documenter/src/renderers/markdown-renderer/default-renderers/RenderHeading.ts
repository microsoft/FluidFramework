/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HeadingNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import { renderNodes } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";
import { renderNodeWithHtmlSyntax } from "../Utilities.js";

import { escapeTextForMarkdown } from "./RenderPlainText.js";

/**
 * Maximum heading level supported by most systems.
 *
 * @remarks This corresponds with the max HTML heading level.
 */
const maxHeadingLevel = 6;

/**
 * Renders a {@link HeadingNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks
 *
 * Observes {@link RenderContext.headingLevel} to determine the heading level to use.
 *
 * Will render as HTML when in an a table context.
 */
export function renderHeading(
	headingNode: HeadingNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a header in a table context, we will render using HTML syntax.
	if (context.insideTable === true) {
		renderNodeWithHtmlSyntax(headingNode, writer, context);
	} else {
		renderHeadingWithMarkdownSyntax(headingNode, writer, context);
	}
}

function renderHeadingWithMarkdownSyntax(
	headingNode: HeadingNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	const headingLevel = context.headingLevel;

	writer.ensureSkippedLine(); // Headings require leading blank line

	// Markdown only supports heading levels up to 6. If our level is beyond that, we will render as simple
	// bold text, with an accompanying anchor to ensure we can still link to the text.
	const renderAsHeading = headingLevel <= maxHeadingLevel;
	if (renderAsHeading) {
		const headingPreamble = "#".repeat(headingLevel);
		writer.write(`${headingPreamble} `);
		renderNodes(headingNode.children, writer, context);

		if (headingNode.id !== undefined) {
			const escapedId = escapeTextForMarkdown(headingNode.id);
			writer.write(` {#${escapedId}}`);
		}
	} else {
		if (headingNode.id !== undefined) {
			renderAnchor(headingNode.id, writer);
		}
		renderNodes(headingNode.children, writer, { ...context, bold: true });
	}

	writer.ensureSkippedLine(); // Headings require trailing blank line
}

/**
 * Renders an HTML anchor for the given ID.
 *
 * @param anchorId - The ID of the associated item.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
function renderAnchor(anchorId: string, writer: DocumentWriter): void {
	writer.ensureNewLine(); // Ensure line break before tag
	writer.write(`<a id="${anchorId}"></a>`);
	writer.ensureNewLine(); // Ensure line break after tag
}
