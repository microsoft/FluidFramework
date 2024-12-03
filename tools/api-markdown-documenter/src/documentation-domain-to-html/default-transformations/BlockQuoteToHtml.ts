/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";

import type { BlockQuoteNode } from "../../index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

/**
 * Transform a {@link BlockQuoteNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function blockQuoteToHtml(
	node: BlockQuoteNode,
	context: TransformationContext,
): HastElement {
	return transformChildrenUnderTag({ name: "blockquote" }, node.children, context);
}
