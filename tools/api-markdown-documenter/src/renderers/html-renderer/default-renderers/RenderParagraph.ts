/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { ParagraphNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link ParagraphNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderParagraph(
	node: ParagraphNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before paragraph
	writer.writeLine("<p>");
	writer.increaseIndent();
	renderNodes(node.children, writer, context);
	writer.ensureNewLine(); // Ensure line break after content
	writer.decreaseIndent();
	writer.writeLine("</p>");
}
