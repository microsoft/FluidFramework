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

import type { LinkNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transforms a {@link LinkNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function linkToHtml(node: LinkNode, context: TransformationContext): HastElement {
	return h("a", { href: node.target }, node.text);
}
