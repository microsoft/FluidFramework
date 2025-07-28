/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PhrasingContent as MdastPhrasingContent } from "mdast";

import type { SpanNode, TextFormatting } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link SpanNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function spanToMarkdown(
	node: SpanNode,
	context: TransformationContext,
): MdastPhrasingContent[] {
	const transformedChildren: MdastPhrasingContent[] = [];
	for (const child of node.children) {
		transformedChildren.push(...phrasingContentToMarkdown(child, context));
	}
	return applyFormatting(transformedChildren, node.textFormatting);
}

/**
 * Wraps the provided tree in the appropriate formatting tags based on the provided context.
 */
function applyFormatting(
	tree: MdastPhrasingContent[],
	formatting: TextFormatting,
): MdastPhrasingContent[] {
	let result: MdastPhrasingContent[] = tree;

	// The ordering in which we wrap here is effectively arbitrary, but it does impact the order of the tags in the output.
	// Note if you're editing this code: tests may implicitly rely on this ordering.
	if (formatting.strikethrough === true) {
		result = [
			{
				type: "delete",
				children: result,
			},
		];
	}
	if (formatting.italic === true) {
		result = [
			{
				type: "emphasis",
				children: result,
			},
		];
	}
	if (formatting.bold === true) {
		result = [
			{
				type: "strong",
				children: result,
			},
		];
	}

	return result;
}
