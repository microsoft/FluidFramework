/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";

import { TableCellKind, type TableCellNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

/**
 * Transform a {@link TableCellNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function tableCellToHtml(node: TableCellNode, context: TransformationContext): HastElement {
	return transformChildrenUnderTag(
		{ name: node.cellKind === TableCellKind.Header ? "th" : "td" },
		node.children,
		context,
	);
}
