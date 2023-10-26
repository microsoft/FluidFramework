/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TableNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import type { RenderContext } from "../RenderContext";
import { renderContentsUnderTag } from "../Utilities";

/**
 * Renders a {@link TableNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within another table context.
 */
export function renderTable(node: TableNode, writer: DocumentWriter, context: RenderContext): void {
	const prettyFormatting = context.prettyFormatting !== false;

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break before table tag
	}

	writer.write("<table>");

	if (prettyFormatting) {
		writer.ensureNewLine();
		writer.increaseIndent();
	}

	// Write header row if one was specified
	if (node.headerRow !== undefined) {
		renderContentsUnderTag([node.headerRow], "thead", writer, context);
	}

	// Write child contents under `tbody` element if the table has any
	if (node.hasChildren) {
		renderContentsUnderTag(node.children, "tbody", writer, context);
	}

	if (prettyFormatting) {
		writer.ensureNewLine();
		writer.decreaseIndent();
	}

	writer.write("</table>");

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break before table tag
	}
}
