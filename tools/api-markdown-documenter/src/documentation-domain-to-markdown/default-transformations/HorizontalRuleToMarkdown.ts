/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ThematicBreak as MdastThematicBreak } from "mdast";

import type { HorizontalRuleNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function horizontalRuleToMarkdown(
	node: HorizontalRuleNode,
	context: TransformationContext,
): MdastThematicBreak {
	// TODO: Do we need to do anything special in tables?

	return {
		type: "thematicBreak",
	};
}
