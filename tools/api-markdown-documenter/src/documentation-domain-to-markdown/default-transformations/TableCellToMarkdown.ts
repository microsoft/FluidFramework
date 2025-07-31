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
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import type { TransformationContext } from "../TransformationContext.js";

import { transformAsHtml } from "./Utilities.js";

/**
 * Transform a {@link TableCellNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function tableCellToMarkdown(
	node: TableCellNode,
	context: TransformationContext,
): [MdastTableCell] {
	const transformedChildren: MdastPhrasingContent[] = [];
	for (const child of node.children) {
		transformedChildren.push(...transformCellContent(child, context));
	}

	return [
		{
			type: "tableCell",
			children: transformedChildren,
		},
	];
}

/**
 * Transform block content under a table cell to Markdown.
 */
function transformCellContent(
	node: TableCellContent,
	context: TransformationContext,
): [MdastPhrasingContent] {
	// Since our library supports block content under table cells, but Markdown does not,
	// we need to wrap contents that are not simple phrasing content as HTML.
	if (["text", "codeSpan", "link", "span", "markdownPhrasingContent"].includes(node.type)) {
		return phrasingContentToMarkdown(node as PhrasingContent, context);
	}

	return [transformAsHtml(node, context)];
}
