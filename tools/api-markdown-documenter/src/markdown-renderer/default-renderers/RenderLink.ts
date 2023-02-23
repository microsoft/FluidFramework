/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { LinkNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import { renderNodes } from "../Render";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link LinkNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context.
 */
export function renderLink(
	node: LinkNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideHtml === true) {
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
