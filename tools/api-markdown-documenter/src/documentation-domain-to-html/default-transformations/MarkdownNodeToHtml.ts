/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastNodes } from "hast";
import { toHast } from "mdast-util-to-hast";

import type {
	MarkdownBlockContentNode,
	MarkdownPhrasingContentNode,
} from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link MarkdownBlockContentNode} or {@link MarkdownPhrasingContentNode} to HTML.
 *
 * @param node - The node to transform.
 * @param context - See {@link TransformationContext}.
 */
export function markdownNodeToHtml(
	node: MarkdownBlockContentNode | MarkdownPhrasingContentNode,
	context: TransformationContext,
): HastNodes {
	return toHast(node.value);
}
