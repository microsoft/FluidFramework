/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Paragraph as MdastParagraph,
	PhrasingContent as MdastPhrasingContent,
} from "mdast";

import type { ParagraphNode } from "../../documentation-domain/index.js";
import { transformPhrasingContent } from "../ToMarkdown.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link ParagraphNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function paragraphToMarkdown(
	node: ParagraphNode,
	context: TransformationContext,
): [MdastParagraph] {
	const transformedChildren: MdastPhrasingContent[] = [];
	for (const child of node.children) {
		transformedChildren.push(...transformPhrasingContent(child, context));
	}

	return [
		{
			type: "paragraph",
			children: transformedChildren,
		},
	];
}
