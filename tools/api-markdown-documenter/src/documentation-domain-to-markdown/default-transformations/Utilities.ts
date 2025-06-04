/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	List as MdastList,
	ListItem as MdastListItem,
	PhrasingContent as MdastPhrasingContent,
} from "mdast";

import type { TextFormatting } from "../../documentation-domain/index.js";

/**
 * TODO
 */
export function createList(
	items: readonly MdastPhrasingContent[],
	ordered: boolean,
): MdastList {
	const wrappedChildren: MdastListItem[] = items.map((item) => {
		const listItem: MdastListItem = {
			type: "listItem",
			children: [
				{
					type: "paragraph",
					children: [item],
				},
			],
		};
		return listItem;
	});

	return {
		type: "list",
		ordered,
		children: wrappedChildren,
	};
}

/**
 * Wraps the provided tree in the appropriate formatting tags based on the provided context.
 */
export function applyFormatting(
	tree: MdastPhrasingContent,
	context: TextFormatting,
): MdastPhrasingContent {
	let result: MdastPhrasingContent = tree;

	// The ordering in which we wrap here is effectively arbitrary, but it does impact the order of the tags in the output.
	// Note if you're editing: tests may implicitly rely on this ordering.
	if (context.strikethrough === true) {
		result = {
			type: "delete",
			children: [result],
		};
	}
	if (context.italic === true) {
		result = {
			type: "emphasis",
			children: [result],
		};
	}
	if (context.bold === true) {
		result = {
			type: "strong",
			children: [result],
		};
	}

	return result;
}
