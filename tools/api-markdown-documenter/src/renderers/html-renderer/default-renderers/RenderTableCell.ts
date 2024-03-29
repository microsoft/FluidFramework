/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableCellKind, type TableCellNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";
import { renderContentsUnderTag } from "../Utilities.js";

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
	renderContentsUnderTag(
		node.children,
		node.cellKind === TableCellKind.Header ? "th" : "td",
		writer,
		context,
	);
}
