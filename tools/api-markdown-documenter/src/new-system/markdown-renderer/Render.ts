/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StringBuilder } from "@microsoft/tsdoc";

import {
	AlertNode,
	BlockQuoteNode,
	CodeSpanNode,
	DocumentNode,
	DocumentationNode,
	DocumentationNodeType,
	FencedCodeBlockNode,
	HeadingNode,
	HierarchicalSectionNode,
	HorizontalRuleNode,
	LineBreakNode,
	LinkNode,
	OrderedListNode,
	ParagraphNode,
	PlainTextNode,
	SpanNode,
	TableCellNode,
	TableNode,
	TableRowNode,
	UnorderedListNode,
} from "../documentation-domain";
import { DocumentWriter } from "./DocumentWriter";
import { DocumentationNodeRenderers, MarkdownRenderContext } from "./RenderContext";
import {
	renderAlert,
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
} from "./default-renderers";

/**
 * Simple class which provides default rendering implementations for nodes
 */
export const defaultNodeRenderers: DocumentationNodeRenderers = {
	[DocumentationNodeType.Alert]: (node, writer, context): void =>
		renderAlert(node as AlertNode, writer, context),
	[DocumentationNodeType.BlockQuote]: (node, writer, context): void =>
		renderBlockQuote(node as BlockQuoteNode, writer, context),
	[DocumentationNodeType.CodeSpan]: (node, writer, context): void =>
		renderCodeSpan(node as CodeSpanNode, writer, context),
	[DocumentationNodeType.FencedCode]: (node, writer, context): void =>
		renderFencedCodeBlock(node as FencedCodeBlockNode, writer, context),
	[DocumentationNodeType.Heading]: (node, writer, context): void =>
		renderHeading(node as HeadingNode, writer, context),
	[DocumentationNodeType.LineBreak]: (node, writer, context): void =>
		renderLineBreak(node as LineBreakNode, writer, context),
	[DocumentationNodeType.Link]: (node, writer, context): void =>
		renderLink(node as LinkNode, writer, context),
	[DocumentationNodeType.HierarchicalSection]: (node, writer, context): void =>
		renderHierarchicalSection(node as HierarchicalSectionNode, writer, context),
	[DocumentationNodeType.HorizontalRule]: (node, writer, context): void =>
		renderHorizontalRule(node as HorizontalRuleNode, writer, context),
	[DocumentationNodeType.OrderedList]: (node, writer, context): void =>
		renderOrderedList(node as OrderedListNode, writer, context),
	[DocumentationNodeType.Paragraph]: (node, writer, context): void =>
		renderParagraph(node as ParagraphNode, writer, context),
	[DocumentationNodeType.PlainText]: (node, writer, context): void =>
		renderPlainText(node as PlainTextNode, writer, context),
	[DocumentationNodeType.Span]: (node, writer, context): void =>
		renderSpan(node as SpanNode, writer, context),
	[DocumentationNodeType.Table]: (node, writer, context): void =>
		renderTable(node as TableNode, writer, context),
	[DocumentationNodeType.TableCell]: (node, writer, context): void =>
		renderTableCell(node as TableCellNode, writer, context),
	[DocumentationNodeType.TableRow]: (node, writer, context): void =>
		renderTableRow(node as TableRowNode, writer, context),
	[DocumentationNodeType.UnorderedList]: (node, writer, context): void =>
		renderUnorderedList(node as UnorderedListNode, writer, context),
};

/**
 * Generates the root {@link MarkdownRenderContext} for rendering a document with the provided `renderers`.
 */
export function getRootRenderContext(renderers: DocumentationNodeRenderers): MarkdownRenderContext {
	return {
		insideTable: false,
		insideCodeBlock: false,
		insideHtml: false,
		headingLevel: 1,
		renderers,
	};
}

/**
 * Renders a {@link DocumentNode} as Markdown, and returns the resulting file contents as a `string`.
 */
export function renderDocument(
	document: DocumentNode,
	customRenderers?: DocumentationNodeRenderers,
): string {
	const renderers = {
		...defaultNodeRenderers,
		...customRenderers,
	};

	const writer = new DocumentWriter(new StringBuilder());
	renderDocumentNode(document, writer, getRootRenderContext(renderers));
	const renderedBody = writer.getText().trimStart(); // Trim any leading lines / spaces

	return renderedBody;
}

/**
 * Renders the provided {@link DocumentNode} representing the root of some document, per the
 * configured policy ({@link MarkdownRenderContext.renderers}).
 */
function renderDocumentNode(
	node: DocumentNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	renderNodes(node.children, writer, context);

	// TODO: front-matter, header, footer, etc.
}

/**
 * Renders the provided {@link DocumentationNode} per the configured policy
 * ({@link MarkdownRenderContext.renderers}).
 */
export function renderNode(
	node: DocumentationNode,
	writer: DocumentWriter,
	context: MarkdownRenderContext,
): void {
	if (Object.keys(context.renderers).includes(node.type)) {
		context.renderers[node.type](node, writer, context);
	} else {
		throw new Error(
			`Encountered an unrecognized DocumentationNode type: ${node.type}. Please provide a renderer for this type.`,
		);
	}
}

/**
 * Renders a list of child {@link DocumentationNode}s per the configured policy
 * ({@link MarkdownRenderContext.renderers}).
 */
export function renderNodes(
	children: DocumentationNode[],
	writer: DocumentWriter,
	childContext: MarkdownRenderContext,
): void {
	for (const child of children) {
		renderNode(child, writer, childContext);
	}
}
