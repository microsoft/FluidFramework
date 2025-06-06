/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	PhrasingContent as MdastPhrasingContent,
	TableCell as MdastTableCell,
} from "mdast";

import {
	isPhrasingContent,
	type TableCellContent,
	type TableCellNode,
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
): MdastTableCell {
	// TODO: ensure block content is HTML wrapped
	const transformedChildren = node.children.map((child) =>
		transformCellContent(child, context),
	);

	return {
		type: "tableCell",
		children: transformedChildren,
	};
}

/**
 * TODO
 */
function transformCellContent(
	node: TableCellContent,
	context: TransformationContext,
): MdastPhrasingContent {
	if (isPhrasingContent(node)) {
		return transformPhrasingContent(node, context);
	}

	return transformAsHtml(node, context);
}
