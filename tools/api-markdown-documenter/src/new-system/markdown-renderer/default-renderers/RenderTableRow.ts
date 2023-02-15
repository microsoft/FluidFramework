import type { TableRowNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an TableRowNode to generate a row of markdown elements.
 *
 * @param node - TableRowNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the TableRowNode as a string
 */
export function renderTableRow(
	node: TableRowNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideHtml) {
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
	for (const child of node.children) {
		renderNode(child, writer, {
			...context,
			insideTable: true,
		});
		writer.write(" |");
	}
	writer.ensureNewLine(); // Ensure linebreak after row
}

function renderTableRowWithHtmlSyntax(
	node: TableRowNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.writeLine("<tr>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideTable: true,
		insideHtml: true,
	});
	writer.decreaseIndent();
	writer.writeLine("</tr>");
}
