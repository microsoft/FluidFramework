/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Element as HastElement } from "hast";

import type { ListNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

/**
 * Transform a {@link ListNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function listToHtml(node: ListNode, context: TransformationContext): HastElement {
	return transformChildrenUnderTag(
		{ name: node.ordered ? "ol" : "ul" },
		node.children,
		context,
	);
}
