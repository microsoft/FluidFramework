/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";

import type { TableRowNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag, type HtmlTag } from "../Utilities.js";

const tableRowTag: HtmlTag = { name: "tr" };

/**
 * Transform a {@link TableRowNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function tableRowToHtml(
	node: TableRowNode,
	context: TransformationContext,
): HastElement {
	return transformChildrenUnderTag(tableRowTag, node.children, context);
}
