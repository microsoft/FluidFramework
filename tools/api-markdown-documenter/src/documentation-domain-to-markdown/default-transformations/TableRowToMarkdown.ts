/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TableCell as MdastTableCell, TableRow as MdastTableRow } from "mdast";

import type { TableRowNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link TableRowNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function tableRowToMarkdown(
	node: TableRowNode,
	context: TransformationContext,
): [MdastTableRow] {
	const { transformations } = context;

	const transformedChildren: MdastTableCell[] = [];
	for (const cell of node.children) {
		transformedChildren.push(...transformations.tableCell(cell, context));
	}

	return [
		{
			type: "tableRow",
			children: transformedChildren,
		},
	];
}
