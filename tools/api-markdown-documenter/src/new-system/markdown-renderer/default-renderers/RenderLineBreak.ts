/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { LineBreakNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link LineBreakNode}.
 *
 * @param node - LineBreakNode to convert into markdown
 * @param context - Rendering context.
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
