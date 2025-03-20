/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastTree } from "hast";

import type { CodeSpanNode } from "../../index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

import { applyFormatting } from "./Utilities.js";

/**
 * Transform a {@link BlockQuoteNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function codeSpanToHtml(node: CodeSpanNode, context: TransformationContext): HastTree {
	const transformed = transformChildrenUnderTag({ name: "code" }, node.children, context);
	return applyFormatting(transformed, context);
}
