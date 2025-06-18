/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TableRowNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import { renderNode } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";

/**
 * Renders a {@link TableRowNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderTableRow(
	node: TableRowNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	writer.ensureNewLine(); // Ensure line break before new row
	writer.write("| ");
	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];

		if (child.isEmpty) {
			writer.write("|");
		} else {
			renderNode(child, writer, {
				...context,
				insideTable: true,
			});
			writer.write(" |");
		}
		if (i < node.children.length - 1) {
			writer.write(" ");
		}
	}
	writer.ensureNewLine(); // Ensure line break after row
}
