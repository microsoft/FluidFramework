/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { List as MdastList, PhrasingContent as MdastPhrasingContent } from "mdast";

import type { OrderedListNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

import { createList } from "./Utilities.js";

/**
 * Transform a {@link OrderedListNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function orderedListToMarkdown(
	node: OrderedListNode,
	context: TransformationContext,
): MdastList {
	const { transformations } = context;
	const transformedChildren: MdastPhrasingContent[] = node.children.map((child) =>
		transformations[child.type](child, context),
	);

	return createList(transformedChildren, true);
}
