/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Text as HastText } from "hast";

import type { PlainTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function plainTextToHtml(
	node: PlainTextNode,
	context: TransformationContext,
): HastText {
	return {
		type: "text",
		value: node.text,
	};
}
