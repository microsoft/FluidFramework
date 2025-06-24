/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastTree } from "hast";
import { h } from "hastscript";

import type { CodeSpanNode } from "../../index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link BlockQuoteNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function codeSpanToHtml(node: CodeSpanNode, context: TransformationContext): HastTree {
	return h("code", node.isEmpty ? [] : [{ type: "text", value: node.value }]);
}
