/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { LineBreakNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link LineBreakNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link MarkdownRenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within a table context.
 */
export function renderLineBreak(
	node: LineBreakNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (context.insideTable || context.insideHtml) {
		renderLineBreakWithHtmlSyntax(writer);
	} else {
		renderLineBreakWithMarkdownSyntax(writer);
	}
}

function renderLineBreakWithMarkdownSyntax(writer: DocumentWriter): void {
	writer.writeLine();
}

function renderLineBreakWithHtmlSyntax(writer: DocumentWriter): void {
	writer.ensureNewLine();
	writer.writeLine("<br>");
}
