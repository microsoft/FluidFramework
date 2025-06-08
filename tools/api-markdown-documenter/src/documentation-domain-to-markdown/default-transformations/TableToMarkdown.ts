/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Table as MdastTable, TableRow as MdastTableRow } from "mdast";

import type { TableNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

// TODO: transform as HTML when in table context

/**
 * Transform a {@link TableNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within another table context.
 */
export function tableToMarkdown(
	node: TableNode,
	context: TransformationContext,
): [MdastTable] {
	const { transformations } = context;

	const transformedChildren: MdastTableRow[] = [];

	if (node.headerRow !== undefined) {
		transformedChildren.push(...transformations.tableRow(node.headerRow, context));
	}
	if (node.children.length > 0) {
		for (const row of node.children) {
			transformedChildren.push(...transformations.tableRow(row, context));
		}
	}

	return [
		{
			type: "table",
			children: transformedChildren,
		},
	];
}
