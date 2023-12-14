/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	TableBodyCellNode,
	TableBodyRowNode,
	type TableCellNode,
	type TableNode,
} from "../../../documentation-domain";
import type { DocumentWriter } from "../../DocumentWriter";
import { renderNode, renderNodes } from "../Render";
import type { RenderContext } from "../RenderContext";
import { renderNodeWithHtmlSyntax } from "../Utilities";

/**
 * Renders a {@link TableNode} as Markdown.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as HTML when within another table's context.
 */
export function renderTable(node: TableNode, writer: DocumentWriter, context: RenderContext): void {
	// Render as HTML if we are rendering this table under another table (not supported natively by Markdown).
	if (context.insideTable === true) {
		renderNodeWithHtmlSyntax(node, writer, context);
	} else {
		renderTableWithMarkdownSyntax(node, writer, context);
	}
}

function renderTableWithMarkdownSyntax(
	node: TableNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	const childContext: RenderContext = {
		...context,
		insideTable: true,
	};

	writer.ensureSkippedLine(); // Ensure blank line before table

	if (node.headerRow !== undefined) {
		const headerCellCount = node.headerRow.children.length;

		// Render heading row
		renderNode(node.headerRow, writer, childContext);
		writer.ensureNewLine();

		// Render separator row
		renderNode(
			new TableBodyRowNode(
				// eslint-disable-next-line unicorn/new-for-builtins
				Array<TableCellNode>(headerCellCount).fill(
					TableBodyCellNode.createFromPlainText("---"),
				),
			),
			writer,
			{
				...childContext,
				insideCodeBlock: true, // Ensure that text does not get escaped.
			},
		);
		writer.ensureNewLine();
	}

	renderNodes(node.children, writer, childContext);
	writer.ensureSkippedLine(); // Ensure blank line after table
}
