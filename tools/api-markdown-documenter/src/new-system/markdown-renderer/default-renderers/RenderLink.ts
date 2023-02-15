/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { LinkNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Recursively enumerates an LinkNode to generate a link using markdown syntax.
 *
 * @param node - LinkNode to convert into markdown
 * @param context - Renderer to recursively render child subtrees
 * @returns The markdown representation of the LinkNode as a string
 */
export function renderLink(
	node: LinkNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideHtml) {
		renderLinkWithHtmlSyntax(node, writer, context);
	} else {
		renderLinkWithMarkdownSyntax(node, writer, context);
	}
}

function renderLinkWithMarkdownSyntax(
	node: LinkNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.write("[");
	renderNodes(node.children, writer, context);
	writer.write(`](${node.target})`);
}

function renderLinkWithHtmlSyntax(
	node: LinkNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	writer.write(`<a href='${node.target}'>`);
	renderNodes(node.children, writer, {
		...context,
		insideHtml: true,
	});
	writer.write("</a>");
}
