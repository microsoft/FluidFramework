/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";
import { h } from "hastscript";

import type { TableNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

/**
 * Transform a {@link TableNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within another table context.
 */
export function tableToHtml(node: TableNode, context: TransformationContext): HastElement {
	const transformedChildren: HastElement[] = [];
	if (node.headerRow !== undefined) {
		transformedChildren.push(
			transformChildrenUnderTag({ name: "thead" }, [node.headerRow], context),
		);
	}
	if (node.children.length > 0) {
		transformedChildren.push(
			transformChildrenUnderTag({ name: "tbody" }, node.children, context),
		);
	}

	return h("table", transformedChildren);
}
