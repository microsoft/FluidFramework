/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	documentationNodeToHtml,
	HtmlRenderer,
	MarkdownRenderer,
} from "@fluid-tools/api-markdown-documenter";

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
	// Generate HTML AST for the table node.
	const htmlTree = documentationNodeToHtml(tableNode, {
		rootFormatting: context,
		startingHeadingLevel: context.headingLevel,
		logger: context.logger,
	});
	htmlTree.properties.class = "table table-striped table-hover";

	// Convert the HTML AST to a string.
	const htmlString = HtmlRenderer.renderHtml(htmlTree, { prettyFormatting: true });

	writer.writeLine(htmlString);
}
