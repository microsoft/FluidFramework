/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { ParagraphNode } from "../../../documentation-domain/index.js";
import type { RenderContext } from "../RenderContext.js";
import { renderContentsUnderTag } from "../Utilities.js";

/**
 * Transform a {@link ParagraphNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function transformParagraph(node: ParagraphNode, context: TransformationContext): void {
	renderContentsUnderTag(node.children, "p", writer, context);
}
