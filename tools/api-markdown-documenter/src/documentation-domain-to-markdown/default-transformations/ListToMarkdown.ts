/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { List as MdastList, ListItem as MdastListItem } from "mdast";

import type { ListNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link ListNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function listToMarkdown(node: ListNode, context: TransformationContext): [MdastList] {
	const { transformations } = context;

	const transformedChildren: MdastListItem[] = [];
	for (const item of node.children) {
		transformedChildren.push(...transformations.listItem(item, context));
	}

	return [
		{
			type: "list",
			ordered: node.ordered,
			children: transformedChildren,
		},
	];
}
