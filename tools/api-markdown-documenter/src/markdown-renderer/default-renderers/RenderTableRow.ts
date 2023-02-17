/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TableRowNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link TableRowNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context.
 */
export function renderTableRow(
	node: TableRowNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideHtml === true) {
		renderTableRowWithHtmlSyntax(node, writer, context);
	} else {
		renderTableRowWithMarkdownSyntax(node, writer, context);
	}
}

function renderTableRowWithMarkdownSyntax(
	node: TableRowNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before new row
	writer.write("| ");
	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		renderNode(child, writer, {
			...context,
			insideTable: true,
		});
		writer.write(i === node.children.length - 1 ? " |" : " | ");
	}
	writer.ensureNewLine(); // Ensure line break after row
}

function renderTableRowWithHtmlSyntax(
	node: TableRowNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before row tag
	writer.writeLine("<tr>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideTable: true,
		insideHtml: true,
	});
	writer.ensureNewLine(); // Ensure line break after content
	writer.decreaseIndent();
	writer.writeLine("</tr>");
}
