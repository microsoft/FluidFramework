/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HtmlRenderer, MarkdownRenderer } from "@fluid-tools/api-markdown-documenter";

/**
 * Renders a Docusaurus Admonition from the given parameters.
 * @param {string} admonitionKind -
 * @param {string | undefined} title
 * @param {object[]} children - Child contents to render in the admonition body.
 * @param {DocumentWriter} writer - Writer context object into which the document contents will be written.
 * @param {MarkdownRenderContext} context - See {@link @fluid-tools/api-markdown-documenter#MarkdownRenderContext}.
 */
function renderAdmonition(admonitionKind, title, children, writer, context) {
	// Note: skipped lines around and between contents help ensure compatibility with formatters like Prettier.
	writer.ensureSkippedLine();

	writer.writeLine(`:::${admonitionKind}${title === undefined ? "" : `[${title}]`}`);
	writer.ensureSkippedLine();

	MarkdownRenderer.renderNodes(children, writer, context);
	writer.ensureSkippedLine();

	writer.writeLine(":::");
	writer.ensureSkippedLine();
}

/**
 * Renders an {@link AdmonitionNode} using Docusaurus syntax.
 *
 * @param {AdmonitionNode} admonitionNode - The node to render.
 * @param {DocumentWriter} writer - Writer context object into which the document contents will be written.
 * @param {MarkdownRenderContext} context - See {@link @fluid-tools/api-markdown-documenter#MarkdownRenderContext}.
 */
export function renderAdmonitionNode(admonitionNode, writer, context) {
	renderAdmonition(
		admonitionNode.admonitionKind?.toLocaleLowerCase() ?? "note",
		admonitionNode.title,
		admonitionNode.children,
		writer,
		context,
	);
}

/**
 * Renders a {@link @fluid-tools/api-markdown-documenter#BlockQuoteNode} using Docusaurus admonition syntax.
 *
 * @param {BlockQuoteNode} blockQuoteNode - The node to render.
 * @param {DocumentWriter} writer - Writer context object into which the document contents will be written.
 * @param {MarkdownRenderContext} context - See {@link @fluid-tools/api-markdown-documenter#MarkdownRenderContext}.
 */
export function renderBlockQuoteNode(blockQuoteNode, writer, context) {
	renderAdmonition("note", undefined, blockQuoteNode.children, writer, context);
}

/**
 * Renders a {@link TableNode} using HTML syntax, and applies the desired CSS class to it.
 *
 * @param {TableNode} tableNode - The node to render.
 * @param {DocumentWriter} writer - Writer context object into which the document contents will be written.
 * @param {MarkdownRenderContext} context - See {@link @fluid-tools/api-markdown-documenter#MarkdownRenderContext}.
 */
export function renderTableNode(tableNode, writer, context) {
	const childContext = {
		...context,
		insideTable: true,
	};
	writer.writeLine(`<table class="table table-striped table-hover">`);
	writer.increaseIndent();

	// Write header row if one was specified
	if (tableNode.headerRow !== undefined) {
		writer.writeLine("<thead>");
		writer.increaseIndent();
		// Render header row as HTML, since we have opted to render the entire table as HTML
		HtmlRenderer.renderNode(tableNode.headerRow, writer, childContext);
		writer.ensureNewLine(); // Ensure line break header row contents
		writer.decreaseIndent();
		writer.writeLine("</thead>");
	}

	// Write child contents under `tbody` element if the table has any
	if (tableNode.hasChildren) {
		writer.writeLine("<tbody>");
		writer.increaseIndent();
		// Render body rows as HTML, since we have opted to render the entire table as HTML
		HtmlRenderer.renderNodes(tableNode.children, writer, childContext);
		writer.decreaseIndent();
		writer.writeLine("</tbody>");
	}

	writer.decreaseIndent();
	writer.writeLine("</table>");
}
