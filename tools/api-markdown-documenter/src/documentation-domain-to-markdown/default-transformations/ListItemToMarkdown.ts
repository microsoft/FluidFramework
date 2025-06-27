/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ListItem as MdastListItem, BlockContent as MdastBlockContent, Paragraph } from "mdast";

import type { ListItemNode } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link ListItemNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function listItemToMarkdown(
	node: ListItemNode,
	context: TransformationContext,
): [MdastListItem] {
	const transformedChildren: MdastBlockContent[] = [];
		for (const child of node.children) {
			const paragraph: Paragraph = {
				type: "paragraph",
				children: [
					...phrasingContentToMarkdown(child, context)
				]
			}
			transformedChildren.push(paragraph);
		}

		return [
			{
				type: "listItem",
				children: transformedChildren,
			},
		];
}
