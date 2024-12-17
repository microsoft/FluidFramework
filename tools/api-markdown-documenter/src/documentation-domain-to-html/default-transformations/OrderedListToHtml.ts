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

import type { OrderedListNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformListChildren } from "../Utilities.js";

/**
 * Transform a {@link OrderedListNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function orderedListToHtml(
	node: OrderedListNode,
	context: TransformationContext,
): HastElement {
	return h("ol", transformListChildren(node.children, context));
}
