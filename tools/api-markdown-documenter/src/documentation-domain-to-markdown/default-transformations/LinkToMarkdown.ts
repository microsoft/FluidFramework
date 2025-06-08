/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Link as MdastLink } from "mdast";

import type { LinkNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transforms a {@link LinkNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function linkToMarkdown(node: LinkNode, context: TransformationContext): [MdastLink] {
	return [
		{
			type: "link",
			url: node.target,
			children: [{ type: "text", value: node.text }],
		},
	];
}
