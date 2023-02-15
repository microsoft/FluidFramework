/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AlertNode, PlainTextNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an {@link AlertNode} to generate a Markdown representation of the node.
 *
 * @param node - AlertNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the AlertNode as a string
 */
export function renderAlert(
	node: AlertNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Alert rendering is multi-line, and so if we are inside a table, we need to use HTML syntax.
	if (context.insideTable || context.insideHtml) {
		renderAlertWithHtmlSyntax(node, writer, context);
	} else {
		renderAlertWithMarkdownSyntax(node, writer, context);
	}
}

function renderAlertWithMarkdownSyntax(
	node: AlertNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	const headerText = getAlertHeaderText(node);

	writer.ensureSkippedLine(); // Block quotes require a leading blank line
	writer.increaseIndent("> "); // Use block quote indentation
	renderNode(new PlainTextNode(headerText), writer, {
		...context,
		bold: true,
	});
	writer.ensureSkippedLine(); // Ensure blank line between header and child content
	renderNodes(node.children, writer, context);
	writer.decreaseIndent();
	writer.ensureSkippedLine(); // Block quotes require a trailing blank line
}

function renderAlertWithHtmlSyntax(
	node: AlertNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	const headerText = getAlertHeaderText(node);

	writer.ensureNewLine();
	writer.writeLine("<blockquote>");
	writer.increaseIndent();
	renderNode(new PlainTextNode(headerText), writer, {
		...context,
		bold: true,
	});
	writer.ensureNewLine();
	writer.writeLine("<br>"); // Ensure blank line between header and child content
	writer.writeLine("<br>");
	renderNodes(node.children, writer, {
		...context,
		insideHtml: true,
	});
	writer.ensureNewLine();
	writer.decreaseIndent();
	writer.writeLine("</blockquote>");
}

function getAlertHeaderText(node: AlertNode): string {
	const headerText: string[] = [];
	headerText.push(`[${node.alertKind}]`);
	if (node.title !== undefined) {
		headerText.push(`: ${node.title}`);
	}
	return headerText.join("");
}
