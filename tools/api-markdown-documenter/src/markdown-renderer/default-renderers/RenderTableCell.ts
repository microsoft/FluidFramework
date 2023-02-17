/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TableCellKind, TableCellNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link TableCellNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context.
 */
export function renderTableCell(
	node: TableCellNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideHtml === true) {
		renderTableCellWithHtmlSyntax(node, writer, context);
	} else {
		renderTableCellWithMarkdownSyntax(node, writer, context);
	}
}

function renderTableCellWithMarkdownSyntax(
	node: TableCellNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Note: Cell boundaries are handled by the TableRow renderer.
	renderNodes(node.children, writer, {
		...context,
		insideTable: true,
	});
}

function renderTableCellWithHtmlSyntax(
	node: TableCellNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before cell tag
	writer.writeLine(node.cellKind === TableCellKind.Header ? "<th>" : "<td>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideTable: true,
		insideHtml: true,
	});
	writer.ensureNewLine(); // Ensure line break after content
	writer.decreaseIndent();
	writer.writeLine(node.cellKind === TableCellKind.Header ? "</th>" : "</td>");
}
