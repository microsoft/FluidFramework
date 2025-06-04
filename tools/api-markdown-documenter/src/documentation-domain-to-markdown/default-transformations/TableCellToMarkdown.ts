/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TableCell as MdastTableCell } from "mdast";

import type { TableCellNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link TableCellNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function tableCellToMarkdown(
	node: TableCellNode,
	context: TransformationContext,
): MdastTableCell {
	// const { transformations } = context;

	// TODO: ensure block content is HTML wrapped
	// const transformedChildren = node.children.map((child) =>
	// 	transformations[child.type](child, {
	// 		...context,
	// 		insideTable: true,
	// 	}),
	// );

	throw new Error("TODO");
}
