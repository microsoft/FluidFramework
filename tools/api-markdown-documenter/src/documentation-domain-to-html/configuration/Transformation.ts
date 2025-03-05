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
import type { TransformationContext } from "../TransformationContext.js";
import {
	blockQuoteToHtml,
	codeSpanToHtml,
	fencedCodeBlockToHtml,
	headingToHtml,
	sectionToHtml,
	linkToHtml,
	orderedListToHtml,
	paragraphToHtml,
	plainTextToHtml,
	spanToHtml,
	tableToHtml,
	tableCellToHtml,
	tableRowToHtml,
	unorderedListToHtml,
} from "../default-transformations/index.js";

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
 * @public
 */
// Prefer index signature for documentation, since it allows documenting the key name.
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Transformations {
	/**
	 * Maps from a {@link DocumentationNode}'s {@link DocumentationNode."type"} to a transformation implementation
	 * for that kind of node.
	 */
	readonly [documentationNodeKind: string]: Transformation;
}

/**
 * Transformation from a {@link DocumentationNode} to a {@link https://github.com/syntax-tree/hast | HTML syntax tree}.
 *
 * @param node - The input node to be transformed.
 * @param context - Transformation context, including custom transformation implementations.
 *
 * @public
 */
export type Transformation = (
	node: DocumentationNode,
	context: TransformationContext,
) => HastNodes;

// Constants used in transformations below as an allocation optimization.
const hastLineBreak = h("br");
const hastHorizontalRule = h("hr");

/**
 * Default {@link DocumentationNode} to {@link https://github.com/syntax-tree/hast | hast} transformations.
 */
export const defaultTransformations: Transformations = {
	[DocumentationNodeType.BlockQuote]: (node, context) =>
		blockQuoteToHtml(node as BlockQuoteNode, context),
	[DocumentationNodeType.CodeSpan]: (node, context) =>
		codeSpanToHtml(node as CodeSpanNode, context),
	[DocumentationNodeType.FencedCode]: (node, context) =>
		fencedCodeBlockToHtml(node as FencedCodeBlockNode, context),
	[DocumentationNodeType.Heading]: (node, context) =>
		headingToHtml(node as HeadingNode, context),
	[DocumentationNodeType.LineBreak]: () => hastLineBreak,
	[DocumentationNodeType.Link]: (node, context) => linkToHtml(node as LinkNode, context),
	[DocumentationNodeType.Section]: (node, context) =>
		sectionToHtml(node as SectionNode, context),
	[DocumentationNodeType.HorizontalRule]: () => hastHorizontalRule,
	[DocumentationNodeType.OrderedList]: (node, context) =>
		orderedListToHtml(node as OrderedListNode, context),
	[DocumentationNodeType.Paragraph]: (node, context) =>
		paragraphToHtml(node as ParagraphNode, context),
	[DocumentationNodeType.PlainText]: (node, context) =>
		plainTextToHtml(node as PlainTextNode, context),
	[DocumentationNodeType.Span]: (node, context) => spanToHtml(node as SpanNode, context),
	[DocumentationNodeType.Table]: (node, context) => tableToHtml(node as TableNode, context),
	[DocumentationNodeType.TableCell]: (node, context) =>
		tableCellToHtml(node as TableCellNode, context),
	[DocumentationNodeType.TableRow]: (node, context) =>
		tableRowToHtml(node as TableRowNode, context),
	[DocumentationNodeType.UnorderedList]: (node, context) =>
		unorderedListToHtml(node as UnorderedListNode, context),
};
