/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { FencedCodeBlockNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link FencedCodeBlockNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderFencedCodeBlock(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.writeLine("<code>");
	writer.increaseIndent();
	renderNodes(node.children, writer, context);
	writer.ensureNewLine(); // Ensure newline after body content
	writer.decreaseIndent();
	writer.writeLine("</code>");
}
