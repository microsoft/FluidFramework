/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { SpanNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link SpanNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderSpan(node: SpanNode, writer: DocumentWriter, context: RenderContext): void {
	// Note: we don't bother introducing style nesting for code spans.
	// This policy is arbitrary and could be changed if there is reason to.
	writer.write("<span>");
	renderNodes(node.children, writer, {
		...context,
		...node.textFormatting, // Override any existing formatting as needed
	});
	writer.write("</span>");
}
