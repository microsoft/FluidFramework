import { TableCellNode, TableNode, TableRowNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link TableNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within another table context.
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
			{
				...childContext,
				insideCodeBlock: true, // Ensure that text does not get escaped.
			},
		);
		writer.ensureNewLine();
	}

	renderNodes(node.children, writer, childContext);
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

	// Write child contents under `tbody` element if the table has any
	if (node.hasChildren) {
		writer.writeLine("<tbody>");
		writer.increaseIndent();
		renderNodes(node.children, writer, childContext);
		writer.decreaseIndent();
		writer.writeLine("</tbody>");
	}

	writer.decreaseIndent();
	writer.writeLine("</table>");
}
