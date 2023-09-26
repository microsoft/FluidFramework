/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { HeadingNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";
import { renderAnchor } from "../Utilities";

/**
 * Maximum heading level supported by most systems.
 *
 * @remarks This corresponds with the max HTML heading level.
 */
const maxHeadingLevel = 6;

/**
 * Renders a {@link HeadingNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks
 *
 * Observes {@link RenderContext.headingLevel} to determine the heading level to use.
 */
export function renderHeading(
	headingNode: HeadingNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	const headingLevel = context.headingLevel;
	const prettyFormatting = context.prettyFormatting !== false;

	// HTML only supports heading levels up to 6. If our level is beyond that, we will render as simple
	// bold text, with an accompanying anchor to ensure we can still link to the text.
	const renderAsHeading = headingLevel <= maxHeadingLevel;
	if (renderAsHeading) {
		writer.write(`<h${headingLevel}`);
		if (headingNode.id !== undefined) {
			writer.write(` id="${headingNode.id}"`);
		}
		writer.write(">");

		if (prettyFormatting) {
			writer.ensureNewLine();
			writer.increaseIndent();
		}

		renderNodes(headingNode.children, writer, context);

		if (prettyFormatting) {
			writer.ensureNewLine();
			writer.decreaseIndent();
		}

		writer.write(`</h${headingLevel}>`);

		if (prettyFormatting) {
			writer.ensureNewLine();
		}
	} else {
		if (headingNode.id !== undefined) {
			renderAnchor(headingNode.id, writer, context);
			if (prettyFormatting) {
				writer.ensureNewLine();
			}
		}
		renderNodes(headingNode.children, writer, {
			...context,
			bold: true,
		});
		if (prettyFormatting) {
			writer.ensureNewLine();
		}
	}
}
