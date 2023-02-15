/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { HorizontalRuleNode } from "../../documentation-domain";
import type { DocumentWriter } from "../DocumentWriter";
import type { MarkdownRenderContext } from "../RenderContext";

/**
 * Renders a {@link HorizontalRuleNode}.
 *
 * @param node - LineBreakNode to convert into markdown
 * @param context - Rendering context.
 */
export function renderHorizontalRule(
	node: HorizontalRuleNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	// Horizontal rule syntax conflicts with table syntax in Markdown,
	// so if we are inside of a table, we must render using HTML syntax.
	if (context.insideTable || context.insideHtml) {
		renderHorizontalRuleWithHtmlSyntax(writer);
	} else {
		renderHorizontalRuleWithMarkdownSyntax(writer);
	}
}

function renderHorizontalRuleWithMarkdownSyntax(writer: DocumentWriter): void {
	writer.ensureSkippedLine(); // Markdown horizontal rules require leading blank line
	writer.writeLine("---");
	writer.ensureSkippedLine(); // Markdown horizontal rules require trailing blank line
}

function renderHorizontalRuleWithHtmlSyntax(writer: DocumentWriter): void {
	writer.ensureNewLine();
	writer.writeLine("<hr>");
}
