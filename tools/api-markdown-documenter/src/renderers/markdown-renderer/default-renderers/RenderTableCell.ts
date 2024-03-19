/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TableCellNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import { renderNodes } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";

/**
 * Renders a {@link TableCellNode} as Markdown.
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
	// Cell boundaries are handled by the TableRow renderer, so the only thing to render is its child content.
	renderNodes(node.children, writer, {
		...context,
		insideTable: true,
	});
}
