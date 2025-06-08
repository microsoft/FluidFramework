/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PhrasingContent as MdastPhrasingContent, Text as MdastText } from "mdast";

import type { PlainTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

import { applyFormatting } from "./Utilities.js";

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function plainTextToMarkdown(
	node: PlainTextNode,
	context: TransformationContext,
): MdastPhrasingContent[] {
	const transformed: MdastText = {
		type: "text",
		value: node.value,
	};

	return [applyFormatting(transformed, context)];
}
