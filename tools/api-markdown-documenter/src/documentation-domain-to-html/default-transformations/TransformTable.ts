/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TableNode } from "../../../documentation-domain/index.js";
import type { RenderContext } from "../RenderContext.js";
import { renderContentsUnderTag } from "../Utilities.js";

/**
 * Transform a {@link TableNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within another table context.
 */
export function transformTable(node: TableNode, context: TransformationContext): void {
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
