/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TableCellKind, type TableCellNode } from "../../../documentation-domain/index.js";
import type { RenderContext } from "../RenderContext.js";
import { renderContentsUnderTag } from "../Utilities.js";

/**
 * Transform a {@link TableCellNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function transformTableCell(node: TableCellNode, context: TransformationContext): void {
	renderContentsUnderTag(
		node.children,
		node.cellKind === TableCellKind.Header ? "th" : "td",
		writer,
		context,
	);
}
