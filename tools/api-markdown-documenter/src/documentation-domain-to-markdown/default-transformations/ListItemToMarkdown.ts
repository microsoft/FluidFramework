/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ListItem as MdastListItem,
	PhrasingContent as MdastPhrasingContent,
} from "mdast";

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
	const transformedChildren: MdastPhrasingContent[] = [];
	for (const child of node.children) {
		transformedChildren.push(...phrasingContentToMarkdown(child, context));
	}

	return [
		{
			type: "listItem",
			children: [
				{
					type: "paragraph",
					children: transformedChildren,
				},
			],
		},
	];
}
