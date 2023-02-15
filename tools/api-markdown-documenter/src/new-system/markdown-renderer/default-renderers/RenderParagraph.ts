import type { ParagraphNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link ParagraphNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within a table context.
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
	writer.ensureNewLine(); // Ensure line break after content
	writer.decreaseIndent();
	writer.writeLine("</p>");
}
