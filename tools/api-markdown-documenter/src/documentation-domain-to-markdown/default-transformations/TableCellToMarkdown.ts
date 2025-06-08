/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	PhrasingContent as MdastPhrasingContent,
	TableCell as MdastTableCell,
} from "mdast";

import type {
	PhrasingContent,
	TableCellContent,
	TableCellNode,
} from "../../documentation-domain/index.js";
import { transformPhrasingContent } from "../ToMarkdown.js";
import type { TransformationContext } from "../TransformationContext.js";

import { transformAsHtml } from "./Utilities.js";

/**
 * Transform a {@link TableCellNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function tableCellToMarkdown(
	node: TableCellNode,
	context: TransformationContext,
): [MdastTableCell] {
	const transformedChildren = node.children.map((child) =>
		transformCellContent(child, context),
	);

	return [
		{
			type: "tableCell",
			children: transformedChildren,
		},
	];
}

/**
 * TODO
 */
function transformCellContent(
	node: TableCellContent,
	context: TransformationContext,
): MdastPhrasingContent {
	// Since our library supports block content under table cells, but Markdown does not,
	// we need to wrap contents that are not simple phrasing content as HTML.
	if (node.type in ["text", "codeSpan", "link", "span"]) {
		return transformPhrasingContent(node as PhrasingContent, context)[0];
	}

	return transformAsHtml(node, context);
}
