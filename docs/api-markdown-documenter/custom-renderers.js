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
 * Renders an {@link @fluid-tools/api-markdown-documenter#AlertNode} using Hugo syntax.
 *
 * @param {AlertNode} alertNode - The node to render.
 * @param {DocumentWriter} writer - Writer context object into which the document contents will be written.
 * @param {MarkdownRenderContext} context - See {@link @fluid-tools/api-markdown-documenter#MarkdownRenderContext}.
 */
export function renderAlertNode(alertNode, writer, context) {
	writer.ensureNewLine();

	writer.writeLine(
		`{{% callout ${alertNode.alertKind?.toLocaleLowerCase() ?? "note"} "${
			alertNode.title ?? ""
		}" %}}`,
	);

	MarkdownRenderer.renderNodes(alertNode.children, writer, context);
	writer.ensureNewLine();

	writer.writeLine("{{% /callout %}}");
	writer.writeLine();
}

/**
 * Renders a {@link @fluid-tools/api-markdown-documenter#BlockQuoteNode} using Hugo syntax.
 *
 * @param {BlockQuoteNode} blockQuoteNode - The node to render.
 * @param {DocumentWriter} writer - Writer context object into which the document contents will be written.
 * @param {MarkdownRenderContext} context - See {@link @fluid-tools/api-markdown-documenter#MarkdownRenderContext}.
 */
export function renderBlockQuoteNode(blockQuoteNode, writer, context) {
	writer.ensureNewLine();

	writer.writeLine("{{% callout note %}}");

	MarkdownRenderer.renderNodes(blockQuoteNode.children, writer, context);
	writer.ensureNewLine();

	writer.writeLine("{{% /callout %}}");
	writer.writeLine();
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
