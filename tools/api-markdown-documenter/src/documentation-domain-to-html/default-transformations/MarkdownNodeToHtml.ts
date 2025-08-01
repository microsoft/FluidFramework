/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastNodes } from "hast";
import { toHast } from "mdast-util-to-hast";

import type { MarkdownBlockContentNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link MarkdownBlockContentNode} or {@link MarkdownPhrasingContentNode} to HTML.
 *
 * @param node - The node to transform.
 * @param context - See {@link TransformationContext}.
 */
export function markdownNodeToHtml(
	node: MarkdownBlockContentNode,
	context: TransformationContext,
): HastNodes {
	return toHast(node.value, {
		// Needed as a temporary workaround for lack of support for `hast` trees directly in `mdast`.
		// Only raw HTML strings are supported by default in `mdast`.
		// In a future PR, we will introduce an extension that allows `hast` trees to be used directly instead of this.
		// All HTML content is generated directly by this library. No user HTML content is passed through, so this is safe, just not a best practice.
		allowDangerousHtml: true,
	});
}
