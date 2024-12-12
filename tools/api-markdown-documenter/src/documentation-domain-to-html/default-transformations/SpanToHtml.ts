/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Element as HastElement } from "hast";
import { h } from "hastscript";

import type { SpanNode } from "../../documentation-domain/index.js";
import { documentationNodesToHtml } from "../ToHtml.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link SpanNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function spanToHtml(node: SpanNode, context: TransformationContext): HastElement {
	const childContext = { ...context, ...node.textFormatting };
	const transformedChildren = documentationNodesToHtml(node.children, childContext);

	return h("span", transformedChildren);
}
