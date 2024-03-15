/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastNodes } from "hast";
import { h } from "hastscript";
import {
	DocumentationNodeType,
	type DocumentationNode,
	type BlockQuoteNode,
	type CodeSpanNode,
	type FencedCodeBlockNode,
	type HeadingNode,
	type LinkNode,
	type SectionNode,
	type OrderedListNode,
	type ParagraphNode,
	type PlainTextNode,
	type SpanNode,
	type TableCellNode,
	type TableNode,
	type TableRowNode,
	type UnorderedListNode,
} from "../../documentation-domain/index.js";
import {
	transformBlockQuote,
	transformCodeSpan,
	transformFencedCodeBlock,
	transformHeading,
	transformHierarchicalSection,
	transformLink,
	transformOrderedList,
	transformParagraph,
	transformPlainText,
	transformSpan,
	transformTable,
	transformTableCell,
	transformTableRow,
	transformUnorderedList,
} from "../default-transformations/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Configuration for transforming {@link DocumentationNode}s to {@link https://github.com/syntax-tree/hast | hast},
 * specified by {@link DocumentationNode."type"}.
 *
 * @remarks
 *
 * The system supplies a suite of default transformations for all nodes of types {@link DocumentationNodeType}.
 * For any other custom {@link DocumentationNode}s, transformations must be specified or the system will throw an error
 * when handling an unknown node kind.
 *
 * @alpha
 */
// Prefer index signature for documentation.
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Transformations {
	/**
	 * Maps from a {@link DocumentationNode}'s {@link DocumentationNode."type"} to a transformation implementation
	 * for that kind of node.
	 *
	 * @param node - The `DocumentationNode` to render.
	 * @param context - Transformation contexturation, including custom transformation implementations.
	 */
	[documentationNodeKind: string]: (
		node: DocumentationNode,
		context: TransformationContext,
	) => HastNodes;
}

const hastLineBreak = h("br");
const hastHorizontalRule = h("hr");

// TODO: restore transformation modules even for simple ones. Makes testing a bit easier.

/**
 * Default {@link DocumentationNode} to {@link https://github.com/syntax-tree/hast | hast} transformations.
 */
export const defaultTransformations: Transformations = {
	[DocumentationNodeType.BlockQuote]: (node, context) =>
		transformBlockQuote(node as BlockQuoteNode, context),
	[DocumentationNodeType.CodeSpan]: (node, context) =>
		transformCodeSpan(node as CodeSpanNode, context),
	[DocumentationNodeType.FencedCode]: (node, context) =>
		transformFencedCodeBlock(node as FencedCodeBlockNode, context),
	[DocumentationNodeType.Heading]: (node, context) =>
		transformHeading(node as HeadingNode, context),
	[DocumentationNodeType.LineBreak]: () => hastLineBreak,
	[DocumentationNodeType.Link]: (node, context) => transformLink(node as LinkNode, context),
	[DocumentationNodeType.Section]: (node, context) =>
		transformHierarchicalSection(node as SectionNode, context),
	[DocumentationNodeType.HorizontalRule]: () => hastHorizontalRule,
	[DocumentationNodeType.OrderedList]: (node, context) =>
		transformOrderedList(node as OrderedListNode, context),
	[DocumentationNodeType.Paragraph]: (node, context) =>
		transformParagraph(node as ParagraphNode, context),
	[DocumentationNodeType.PlainText]: (node, context) =>
		transformPlainText(node as PlainTextNode, context),
	[DocumentationNodeType.Span]: (node, context) => transformSpan(node as SpanNode, context),
	[DocumentationNodeType.Table]: (node, context) => transformTable(node as TableNode, context),
	[DocumentationNodeType.TableCell]: (node, context) =>
		transformTableCell(node as TableCellNode, context),
	[DocumentationNodeType.TableRow]: (node, context) =>
		transformTableRow(node as TableRowNode, context),
	[DocumentationNodeType.UnorderedList]: (node, context) =>
		transformUnorderedList(node as UnorderedListNode, context),
};
