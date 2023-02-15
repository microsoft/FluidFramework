import type { HeadingNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Maximum heading level supported by most systems.
 *
 * @remarks This corresponds with the max HTML heading level.
 */
const maxHeadingLevel = 6;

/**
 * Converts a HeadingNode to markdown. Will use the renderer's hierarchyDepth to set an appropriate depth for the header if no override is supplied on the node.
 *
 * @param headingNode - Node to convert to a header
 * @param context - Renderer to recursively render node subtree
 * @returns The markdown representation of the Heading node as a string
 */
export function renderHeading(
	headingNode: HeadingNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideTable || context.insideHtml) {
		renderHeadingWithHtmlSyntax(headingNode, writer, context);
	} else {
		renderHeadingWithMarkdownSyntax(headingNode, writer, context);
	}
}

function renderHeadingWithMarkdownSyntax(
	headingNode: HeadingNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	const headingLevel = context.headingLevel;

	writer.ensureSkippedLine(); // Headings require leading blank line

	// Markdown only supports heading levels up to 6. If our level is beyond that, we will render as simple
	// bold text, with an accompanying anchor to ensure we can still link to the text.
	const renderAsHeading = headingLevel <= maxHeadingLevel;
	if (renderAsHeading) {
		const headingPreamble = "#".repeat(headingLevel);
		writer.write(`${headingPreamble} `);
		renderNodes(headingNode.children, writer, context);
		if (headingNode.id !== undefined) {
			writer.write(` {#${headingNode.id}}`);
		}
	} else {
		if (headingNode.id !== undefined) {
			renderAnchor(headingNode.id, writer);
		}
		renderNodes(headingNode.children, writer, { ...context, bold: true });
	}

	writer.ensureSkippedLine(); // Headings require trailing blank line
}

function renderHeadingWithHtmlSyntax(
	headingNode: HeadingNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	const headingLevel = context.headingLevel;

	// HTML only supports heading levels up to 6. If our level is beyond that, we will render as simple
	// bold text, with an accompanying anchor to ensure we can still link to the text.
	const renderAsHeading = headingLevel <= maxHeadingLevel;
	if (renderAsHeading) {
		writer.write(`<h${headingLevel}`);
		if (headingNode.id !== undefined) {
			writer.write(` id="${headingNode.id}"`);
		}
		writer.writeLine(">");
		writer.increaseIndent();
		renderNodes(headingNode.children, writer, {
			...context,
			insideHtml: true,
		});
		writer.ensureNewLine();
		writer.decreaseIndent();
		writer.writeLine(`</h${headingLevel}>`);
	} else {
		if (headingNode.id !== undefined) {
			renderAnchor(headingNode.id, writer);
		}
		renderNodes(headingNode.children, writer, {
			...context,
			bold: true,
		});
		writer.ensureNewLine();
	}
}

function renderAnchor(anchorId: string, writer: DocumentWriter): void {
	writer.writeLine(`<a name="${anchorId}" />`);
}
