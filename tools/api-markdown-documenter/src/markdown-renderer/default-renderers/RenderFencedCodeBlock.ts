/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { FencedCodeBlockNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link FencedCodeBlockNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within a table context.
 */
export function renderFencedCodeBlock(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Markdown tables do not support multi-line Markdown content.
	// If we encounter a line break in a table context, we will render using HTML syntax.
	if (context.insideTable === true || context.insideHtml === true) {
		renderFencedCodeBlockWithHtmlSyntax(node, writer, context);
	} else {
		renderFencedCodeBlockWithMarkdownSyntax(node, writer, context);
	}
}

function renderFencedCodeBlockWithMarkdownSyntax(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureSkippedLine(); // Code blocks require a leading blank line
	writer.write("```");
	writer.writeLine(node.language);
	renderNodes(node.children, writer, {
		...context,
		insideCodeBlock: true,
	});
	writer.ensureNewLine(); // Ensure newline after body content
	writer.writeLine("```");
	writer.ensureSkippedLine(); // Code blocks require a trailing blank line
}

function renderFencedCodeBlockWithHtmlSyntax(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.writeLine("<code>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideCodeBlock: true,
		insideHtml: true,
	});
	writer.ensureNewLine(); // Ensure newline after body content
	writer.decreaseIndent();
	writer.writeLine("</code>");
}
