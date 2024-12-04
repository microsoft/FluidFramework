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

import type { UnorderedListNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformListChildren } from "../Utilities.js";

/**
 * Transform a {@link UnorderedListNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function unorderedListToHtml(
	node: UnorderedListNode,
	context: TransformationContext,
): HastElement {
	return h("ul", transformListChildren(node.children, context));
}
