import type { SpanNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an SpanNode to generate markdown from its children. Can be used to apply bold, italic, and strikethrough styles
 *
 * @param node - SpanNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the SpanNode as a string
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
