/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { OrderedListNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNode } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link OrderedListNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderOrderedList(
	node: OrderedListNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.writeLine("<ol>");
	writer.increaseIndent();

	for (const child of node.children) {
		writer.writeLine("<li>");
		writer.increaseIndent();
		renderNode(child, writer, context);
		writer.decreaseIndent();
		writer.ensureNewLine(); // Ensure newline after previous list item
		writer.writeLine("</li>");
	}

	writer.decreaseIndent();
	writer.writeLine("</ol>");
}
