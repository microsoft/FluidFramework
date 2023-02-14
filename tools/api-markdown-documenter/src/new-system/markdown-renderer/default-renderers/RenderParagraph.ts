import type { ParagraphNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an ParagraphNode to generate a paragraph of text.
 *
 * @param node - ParagraphNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @remarks If being rendered inside of a table, will output using HTML paragraph tags
 * @returns The markdown representation of the ParagraphNode as a string
 */
export function renderParagraph(
	node: ParagraphNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Since paragraphs involve line-breaks (which are not allowed within a Markdown table cell),
	// render using HTML syntax if we are in a table context.
	if (context.insideTable || context.insideHtml) {
		renderParagraphWithHtmlSyntax(node, writer, context);
	} else {
		renderParagraphWithMarkdownSyntax(node, writer, context);
	}
}

function renderParagraphWithMarkdownSyntax(
	node: ParagraphNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before paragraph
	renderNodes(node.children, writer, context);
	writer.ensureSkippedLine(); // Ensure blank line after paragraph
}

function renderParagraphWithHtmlSyntax(
	node: ParagraphNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before paragraph
	writer.writeLine("<p>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideHtml: true,
	});
	writer.decreaseIndent();
	writer.writeLine("</p>");
}
