/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Text as MdastText } from "mdast";

import type { PlainTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link PlainTextNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function plainTextToMarkdown(
	node: PlainTextNode,
	context: TransformationContext,
): [MdastText] {
	return [{
		type: "text",
		value: node.value,
	}];
}
