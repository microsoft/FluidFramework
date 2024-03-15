/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";
import { h } from "hastscript";
import type { BlockQuoteNode } from "../../index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodesToHtml } from "../ToHtml.js";

/**
 * Transform a {@link BlockQuoteNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function transformBlockQuote(
	node: BlockQuoteNode,
	context: TransformationContext,
): HastElement {
	return h("code", documentationNodesToHtml(node.children, context));
}
