/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { BlockQuoteNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link BlockQuoteNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderBlockQuote(
	node: BlockQuoteNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.ensureNewLine();
	writer.writeLine("<blockquote>");
	writer.increaseIndent();
	renderNodes(node.children, writer, context);
	writer.ensureNewLine();
	writer.decreaseIndent();
	writer.writeLine("</blockquote>");
}
