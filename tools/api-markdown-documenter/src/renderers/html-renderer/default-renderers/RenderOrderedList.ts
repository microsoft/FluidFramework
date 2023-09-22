/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { OrderedListNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import type { RenderContext } from "../RenderContext";
import { renderListContents } from "../Utilities";

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
	const prettyFormatting = context.prettyFormatting !== false;

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break before tag
	}

	writer.write(`<ol>`);

	if (prettyFormatting) {
		writer.ensureNewLine();
		writer.increaseIndent();
	}

	renderListContents(node.children, writer, context);

	if (prettyFormatting) {
		writer.ensureNewLine();
		writer.decreaseIndent();
	}

	writer.write(`</ol>`);

	if (prettyFormatting) {
		writer.ensureNewLine(); // Ensure line break after tag
	}
}
