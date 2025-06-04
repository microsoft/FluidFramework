/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Code as MdastCode } from "mdast";

import type { FencedCodeBlockNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link FencedCodeBlockNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function fencedCodeBlockToMarkdown(
	node: FencedCodeBlockNode,
	context: TransformationContext,
): MdastCode {
	throw new Error("TODO");
}
