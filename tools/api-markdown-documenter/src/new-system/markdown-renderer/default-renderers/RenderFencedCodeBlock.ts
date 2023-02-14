import type { FencedCodeBlockNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an {@link FencedCodeBlockNode} to generate a Markdown fenced code block.
 *
 * @param node - FencedCodeBlockNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the FencedCodeBlockNode as a string
 */
export function renderFencedCodeBlock(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideTable || context.insideHtml) {
		renderFencedCodeBlockWithHtmlSyntax(node, writer, context);
	} else {
		renderFencedCodeBlockWithMarkdownSyntax(node, writer, context);
	}
}

function renderFencedCodeBlockWithMarkdownSyntax(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.ensureSkippedLine(); // Code blocks require a leading blank line
	writer.write("```");
	writer.writeLine(node.language);
	renderNodes(node.children, writer, {
		...context,
		insideCodeBlock: true,
	});
	writer.writeLine("```");
	writer.ensureSkippedLine(); // Code blocks require a trailing blank line
}

function renderFencedCodeBlockWithHtmlSyntax(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.write("<code>");
	writer.increaseIndent();
	renderNodes(node.children, writer, {
		...context,
		insideCodeBlock: true,
		insideHtml: true,
	});
	writer.decreaseIndent();
	writer.write("</code>");
}
