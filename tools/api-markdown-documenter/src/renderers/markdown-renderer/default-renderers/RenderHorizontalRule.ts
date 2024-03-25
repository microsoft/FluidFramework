/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { HorizontalRuleNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";
import { renderNodeWithHtmlSyntax } from "../Utilities.js";

/**
 * Renders a {@link HorizontalRuleNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as HTML when in a table context.
 */
export function renderHorizontalRule(
	node: HorizontalRuleNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// Horizontal rule syntax conflicts with table syntax in Markdown,
	// so if we are inside of a table, we must render using HTML syntax.
	if (context.insideTable === true) {
		renderNodeWithHtmlSyntax(node, writer, context);
	} else {
		renderHorizontalRuleWithMarkdownSyntax(writer);
	}
}

function renderHorizontalRuleWithMarkdownSyntax(writer: DocumentWriter): void {
	writer.ensureSkippedLine(); // Markdown horizontal rules require leading blank line
	writer.writeLine("---");
	writer.ensureSkippedLine(); // Markdown horizontal rules require trailing blank line
}
