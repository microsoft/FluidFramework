/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	BlockContent as MdastBlockContent,
	PhrasingContent as MdastPhrasingContent,
} from "mdast";

import type {
	MarkdownBlockContentNode,
	MarkdownPhrasingContentNode,
} from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link MarkdownBlockContentNode} to Markdown.
 *
 * @param node - The node to transform.
 * @param context - See {@link TransformationContext}.
 */
export function markdownBlockContentNodeToMarkdown(
	node: MarkdownBlockContentNode,
	context: TransformationContext,
): MdastBlockContent[] {
	return [node.value];
}

/**
 * Transform a {@link MarkdownPhrasingContentNode} to Markdown.
 *
 * @param node - The node to transform.
 * @param context - See {@link TransformationContext}.
 */
export function markdownPhrasingContentNodeToMarkdown(
	node: MarkdownPhrasingContentNode,
	context: TransformationContext,
): MdastPhrasingContent[] {
	return [node.value];
}
