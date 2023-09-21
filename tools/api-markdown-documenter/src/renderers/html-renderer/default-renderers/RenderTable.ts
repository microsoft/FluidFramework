/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TableNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

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
	writer.writeLine("<table>");
	writer.increaseIndent();

	// Write header row if one was specified
	if (node.headerRow !== undefined) {
		writer.writeLine("<thead>");
		writer.increaseIndent();
		renderNode(node.headerRow, writer, context);
		writer.ensureNewLine(); // Ensure line break header row contents
		writer.decreaseIndent();
		writer.writeLine("</thead>");
	}

	// Write child contents under `tbody` element if the table has any
	if (node.hasChildren) {
		writer.writeLine("<tbody>");
		writer.increaseIndent();
		renderNodes(node.children, writer, context);
		writer.decreaseIndent();
		writer.writeLine("</tbody>");
	}

	writer.decreaseIndent();
	writer.writeLine("</table>");
}
