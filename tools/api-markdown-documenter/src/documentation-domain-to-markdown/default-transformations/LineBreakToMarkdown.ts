/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Break } from "mdast";

import type { LineBreakNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link LineBreakNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function lineBreakToMarkdown(
	node: LineBreakNode,
	context: TransformationContext,
): [Break] {
	// TODO: Do we need to do anything special in tables?

	return [
		{
			type: "break",
		},
	];
}
