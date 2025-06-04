/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	BlockQuoteNode,
	CodeSpanNode,
	DocumentationNode,
	FencedCodeBlockNode,
	HeadingNode,
	HorizontalRuleNode,
	LineBreakNode,
	LinkNode,
	OrderedListNode,
	ParagraphNode,
	PlainTextNode,
	SectionNode,
	SpanNode,
	TableCellNode,
	TableNode,
	TableRowNode,
	UnorderedListNode,
} from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";
import {
	renderBlockQuote,
	renderCodeSpan,
	renderFencedCodeBlock,
	renderHeading,
	renderHierarchicalSection,
	renderHorizontalRule,
	renderLineBreak,
	renderLink,
	renderOrderedList,
	renderParagraph,
	renderPlainText,
	renderSpan,
	renderTable,
	renderTableCell,
	renderTableRow,
	renderUnorderedList,
} from "../default-renderers/index.js";

/**
 * Configuration for rendering {@link DocumentationNode}s to `Markdown`, specified by {@link DocumentationNode."type"}.
 *
 * @remarks
 *
 * The system supplies a suite of default renderers for all {@link DocumentationNode} types exported by this library.
 * For any other custom {@link DocumentationNode}s, renderers must be specified or the system will throw an error
 * when rendering an unknown node kind.
 *
 * @public
 */
// Prefer index signature for documentation.
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Renderers {
	/**
	 * Maps from a {@link DocumentationNode}'s {@link DocumentationNode."type"} to a renderer implementation for that kind of node.
	 *
	 * @param node - The `DocumentationNode` to render.
	 * @param writer - The writing context to render into.
	 * @param context - Recursive contextual state.
	 */
	readonly [documentationNodeKind: string]: (
		node: DocumentationNode,
		writer: DocumentWriter,
		context: RenderContext,
	) => void;
}

/**
 * Default Markdown rendering configuration.
 */
export const defaultRenderers: Renderers = {
	blockQuote: (node, writer, context): void =>
		renderBlockQuote(node as BlockQuoteNode, writer, context),
	codeSpan: (node, writer, context): void =>
		renderCodeSpan(node as CodeSpanNode, writer, context),
	fencedCode: (node, writer, context): void =>
		renderFencedCodeBlock(node as FencedCodeBlockNode, writer, context),
	heading: (node, writer, context): void =>
		renderHeading(node as HeadingNode, writer, context),
	lineBreak: (node, writer, context): void =>
		renderLineBreak(node as LineBreakNode, writer, context),
	link: (node, writer, context): void => renderLink(node as LinkNode, writer, context),
	section: (node, writer, context): void =>
		renderHierarchicalSection(node as SectionNode, writer, context),
	horizontalRule: (node, writer, context): void =>
		renderHorizontalRule(node as HorizontalRuleNode, writer, context),
	orderedList: (node, writer, context): void =>
		renderOrderedList(node as OrderedListNode, writer, context),
	paragraph: (node, writer, context): void =>
		renderParagraph(node as ParagraphNode, writer, context),
	text: (node, writer, context): void =>
		renderPlainText(node as PlainTextNode, writer, context),
	span: (node, writer, context): void => renderSpan(node as SpanNode, writer, context),
	table: (node, writer, context): void => renderTable(node as TableNode, writer, context),
	tableCell: (node, writer, context): void =>
		renderTableCell(node as TableCellNode, writer, context),
	tableRow: (node, writer, context): void =>
		renderTableRow(node as TableRowNode, writer, context),
	unorderedList: (node, writer, context): void =>
		renderUnorderedList(node as UnorderedListNode, writer, context),
};
