/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { List as MdastList, PhrasingContent as MdastPhrasingContent } from "mdast";

import type { UnorderedListNode } from "../../documentation-domain/index.js";
import { phrasingContentToMarkdown } from "../ToMarkdown.js";
import type { TransformationContext } from "../TransformationContext.js";

import { createList } from "./Utilities.js";

/**
 * Transform a {@link OrderedListNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function unorderedListToMarkdown(
	node: UnorderedListNode,
	context: TransformationContext,
): [MdastList] {
	const transformedChildren: MdastPhrasingContent[] = [];

	for (const child of node.children) {
		transformedChildren.push(...phrasingContentToMarkdown(child, context));
	}

	return [createList(transformedChildren, false)];
}
