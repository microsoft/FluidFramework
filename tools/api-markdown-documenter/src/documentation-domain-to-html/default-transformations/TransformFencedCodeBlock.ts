/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { FencedCodeBlockNode } from "../../../documentation-domain/index.js";
import type { RenderContext } from "../RenderContext.js";
import { renderContentsUnderTag } from "../Utilities.js";

/**
 * Transform a {@link FencedCodeBlockNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function transformFencedCodeBlock(
	node: FencedCodeBlockNode,
	context: TransformationContext,
): void {
	renderContentsUnderTag(node.children, "code", writer, context);
}
