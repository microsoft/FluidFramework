/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastTree } from "hast";
import { h } from "hastscript";

import type { SpanNode, TextFormatting } from "../../documentation-domain/index.js";
import { documentationNodesToHtml } from "../ToHtml.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link SpanNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function spanToHtml(node: SpanNode, context: TransformationContext): HastTree {
	const childContext = { ...context, ...node.textFormatting };
	const transformedChildren = documentationNodesToHtml(node.children, childContext);
	const formattedChildren = applyFormatting(transformedChildren, node.textFormatting);

	return formattedChildren.length === 1
		? formattedChildren[0]
		: h("span", undefined, formattedChildren);
}

/**
 * Wraps the provided tree in the appropriate formatting tags based on the provided context.
 */
function applyFormatting(contents: HastTree[], formatting: TextFormatting): HastTree[] {
	let result: HastTree[] = contents;

	// The ordering in which we wrap here is effectively arbitrary, but it does impact the order of the tags in the output.
	// Note if you're editing: tests may implicitly rely on this ordering.
	if (formatting.strikethrough === true) {
		result = [h("s", undefined, result)];
	}
	if (formatting.italic === true) {
		result = [h("i", undefined, result)];
	}
	if (formatting.bold === true) {
		result = [h("b", undefined, result)];
	}

	return result;
}
