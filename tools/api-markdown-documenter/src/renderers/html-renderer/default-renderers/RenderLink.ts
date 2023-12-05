/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { LinkNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link LinkNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderLink(node: LinkNode, writer: DocumentWriter, context: RenderContext): void {
	// Note: we don't bother introducing style nesting for code spans.
	// This policy is arbitrary and could be changed if there is reason to.
	writer.write(`<a href='${node.target}'>`);
	renderNodes(node.children, writer, context);
	writer.write("</a>");
}
