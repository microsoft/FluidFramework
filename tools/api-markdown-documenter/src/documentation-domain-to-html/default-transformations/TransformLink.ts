/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { LinkNode } from "../../../documentation-domain/index.js";
import { renderNodes } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";

/**
 * Transforms a {@link LinkNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function transformLink(node: LinkNode, context: TransformationContext): void {
	// Note: we don't bother introducing style nesting for code spans.
	// This policy is arbitrary and could be changed if there is reason to.
	writer.write(`<a href='${node.target}'>`);
	renderNodes(node.children, writer, context);
	writer.write("</a>");
}
