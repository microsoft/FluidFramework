/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { SectionNode } from "../../../documentation-domain/index.js";
import { renderNode, renderNodes } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";

/**
 * Transform a {@link SectionNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks
 *
 * Automatically increases the context's {@link RenderContext.headingLevel}, when rendering child contents,
 * such that heading levels increase appropriately through nested sections.
 */
export function transformSection(node: SectionNode, context: TransformationContext): void {
	const prettyFormatting = context.prettyFormatting !== false;

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break before section tag
	}

	writer.write("<section>");

	if (prettyFormatting) {
		writer.ensureNewLine();
		writer.increaseIndent();
	}

	// Render section heading, if one was provided.
	if (node.heading !== undefined) {
		renderNode(node.heading, writer, context);
		if (prettyFormatting) {
			writer.ensureNewLine(); // Ensure line break after heading element
		}
	}

	renderNodes(node.children, writer, {
		...context,
		headingLevel: context.headingLevel + 1, // Increment heading level for child content
	});

	if (prettyFormatting) {
		writer.ensureNewLine();
		writer.decreaseIndent();
	}

	writer.write("</section>");

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break after section tag
	}
}
