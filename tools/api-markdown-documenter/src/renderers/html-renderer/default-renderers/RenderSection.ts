/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { SectionNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link SectionNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks
 *
 * Automatically increases the context's {@link RenderContext.headingLevel}, when rendering child contents,
 * such that heading levels increase appropriately through nested sections.
 */
export function renderSection(
	node: SectionNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.writeLine("<section>");
	writer.increaseIndent();

	// Render section heading, if one was provided.
	if (node.heading !== undefined) {
		renderNode(node.heading, writer, context);
		writer.ensureNewLine(); // Ensure line break after heading element
	}

	renderNodes(node.children, writer, {
		...context,
		headingLevel: context.headingLevel + 1, // Increment heading level for child content
	});

	writer.decreaseIndent();
	writer.writeLine("</section>");
}
