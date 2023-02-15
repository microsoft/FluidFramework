import type { SpanNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link SpanNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context.
 */
export function renderSpan(
	node: SpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideHtml) {
		renderSpanWithHtmlSyntax(node, writer, context);
	} else {
		renderSpanWithMarkdownSyntax(node, writer, context);
	}
}

function renderSpanWithMarkdownSyntax(
	node: SpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// There is nothing special to a Span from a Markdown perspective.
	// Just a boundary around which we can apply text formatting options.
	renderNodes(node.children, writer, {
		...context,
		...node.textFormatting, // Override any existing formatting as needed
	});
}

function renderSpanWithHtmlSyntax(
	node: SpanNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.write("<span>");
	renderNodes(node.children, writer, {
		...context,
		...node.textFormatting, // Override any existing formatting as needed
		insideHtml: true,
	});
	writer.write("</span>");
}
