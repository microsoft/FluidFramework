import type { TableCellNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an TableCellNode to generate a markdown fenced code block.
 *
 * @param node - TableCellNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the TableCellNode as a string
 */
export function renderTableCell(
	node: TableCellNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideHtml) {
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
	writer.writeLine("<td>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideTable: true,
		insideHtml: true,
	});
	writer.ensureNewLine(); // Ensure line break after content
	writer.decreaseIndent();
	writer.writeLine("</td>");
}
