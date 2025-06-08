/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Blockquote as MdastBlockquote } from "mdast";

import type { BlockQuoteNode } from "../../index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link BlockQuoteNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function blockQuoteToMarkdown(
	node: BlockQuoteNode,
	context: TransformationContext,
): [MdastBlockquote] {
	throw new Error("TODO");
}
