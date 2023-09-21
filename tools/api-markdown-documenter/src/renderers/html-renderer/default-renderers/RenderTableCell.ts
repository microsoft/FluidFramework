/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TableCellKind, type TableCellNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link TableCellNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderTableCell(
	node: TableCellNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before cell tag
	writer.writeLine(node.cellKind === TableCellKind.Header ? "<th>" : "<td>");
	writer.increaseIndent();
	renderNodes(node.children, writer, context);
	writer.ensureNewLine(); // Ensure line break after content
	writer.decreaseIndent();
	writer.writeLine(node.cellKind === TableCellKind.Header ? "</th>" : "</td>");
}
