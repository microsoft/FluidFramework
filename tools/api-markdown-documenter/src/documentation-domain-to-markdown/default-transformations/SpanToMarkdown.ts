/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PhrasingContent as MdastPhrasingContent } from "mdast";

import type { SpanNode } from "../../documentation-domain/index.js";
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
	const childContext = { ...context, ...node.textFormatting };
	const transformedChildren: MdastPhrasingContent[] = [];
	for (const child of node.children) {
		transformedChildren.push(...phrasingContentToMarkdown(child, childContext));
	}
	return transformedChildren;
}
