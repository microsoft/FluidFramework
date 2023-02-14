import { TableCellNode, TableNode, TableRowNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

// TODOs:
// - Support alignment properties in Table, TableRow and TableCell (inherit pattern for resolution)

/**
 * Recursively enumerates an TableNode to generate table using markdown syntax.
 *
 * @param node - TableNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the TableNode as a string
 */
export function renderTable(
	node: TableNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Render as HTML if we are in an HTML context already, or if we are rendering this table
	// under another table (not supported by Markdown).
	if (context.insideTable || context.insideHtml) {
		renderTableWithHtmlSyntax(node, writer, context);
	} else {
		renderTableWithMarkdownSyntax(node, writer, context);
	}
}

function renderTableWithMarkdownSyntax(
	node: TableNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	const childContext: MarkdownRenderContext = {
		...context,
		insideTable: true,
	};

	writer.ensureSkippedLine(); // Ensure blank line before table

	if (node.headingRow !== undefined) {
		const headerCellCount = node.headingRow.children.length;

		// Render heading row
		renderNode(node.headingRow, writer, childContext);
		writer.ensureNewLine();

		// Render separator row
		renderNode(
			new TableRowNode(
				// eslint-disable-next-line unicorn/new-for-builtins
				Array<TableCellNode>(headerCellCount).fill(
					TableCellNode.createFromPlainText("---"),
				),
			),
			writer,
			childContext,
		);
		writer.ensureNewLine();
	}

	renderNodes(node.children, writer, context);
	writer.ensureSkippedLine(); // Ensure blank line after table
}

function renderTableWithHtmlSyntax(
	node: TableNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	const childContext: MarkdownRenderContext = {
		...context,
		insideTable: true,
		insideHtml: true,
	};
	writer.writeLine("<table>");
	writer.increaseIndent();

	// Write header row if one was specified
	if (node.headingRow !== undefined) {
		writer.writeLine("<thead>");
		writer.increaseIndent();
		renderNode(node.headingRow, writer, childContext);
		writer.ensureNewLine(); // Ensure line break header row contents
		writer.decreaseIndent();
		writer.writeLine("</thead>");
	}

	writer.writeLine("<tbody>");
	writer.increaseIndent();
	renderNodes(node.children, writer, childContext);
	writer.decreaseIndent();
	writer.writeLine("</tbody>");
	writer.decreaseIndent();
	writer.writeLine("</table>");
}
