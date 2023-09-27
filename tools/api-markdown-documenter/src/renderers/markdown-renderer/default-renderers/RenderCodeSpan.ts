/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { CodeSpanNode } from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";

/**
 * Renders a {@link CodeSpanNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderCodeSpan(
	node: CodeSpanNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// TODO: This will not correctly handle nested code spans / blocks.
	// We likely want to escape inner code span / block backticks.
	writer.write("`");
	renderNodes(node.children, writer, {
		...context,
		insideCodeBlock: true,
	});
	writer.write("`");
}
