/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Node as HastNode } from "hast";
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
	transformHeading,
	transformHierarchicalSection,
	transformOrderedList,
	transformPlainText,
	transformSpan,
	transformTable,
	transformTableCell,
	transformTableRow,
	transformUnorderedList,
} from "../default-transformations/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

/**
 * contexturation for transforming {@link DocumentationNode}s to {@link https://github.com/syntax-tree/hast | hast},
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
	) => HastNode;
}

const hastLineBreak = h("br");
const hastHorizontalRule = h("hr");

// TODO: restore transformation modules even for simple ones. Makes testing a bit easier.

/**
 * Default {@link DocumentationNode} to {@link https://github.com/syntax-tree/hast | hast} transformations.
 */
export const defaultTransformations: Transformations = {
	[DocumentationNodeType.BlockQuote]: (node, context) =>
		transformChildrenUnderTag(
			{ name: "blockquote" },
			(node as BlockQuoteNode).children,
			context,
		),
	[DocumentationNodeType.CodeSpan]: (node, context) =>
		transformChildrenUnderTag({ name: "code" }, (node as CodeSpanNode).children, context),
	// Note that HTML <code> tags don't support language attributes, so we don't pass anything through here.
	[DocumentationNodeType.FencedCode]: (node, context) =>
		transformChildrenUnderTag(
			{ name: "code" },
			(node as FencedCodeBlockNode).children,
			context,
		),
	[DocumentationNodeType.Heading]: (node, context) =>
		transformHeading(node as HeadingNode, context),
	[DocumentationNodeType.LineBreak]: () => hastLineBreak,
	[DocumentationNodeType.Link]: (node, context) =>
		transformChildrenUnderTag(
			{ name: "a", attributes: { href: (node as LinkNode).target } },
			(node as LinkNode).children,
			context,
		),
	[DocumentationNodeType.Section]: (node, context): HastNode =>
		transformHierarchicalSection(node as SectionNode, context),
	[DocumentationNodeType.HorizontalRule]: (): HastNode => hastHorizontalRule,
	[DocumentationNodeType.OrderedList]: (node, context): HastNode =>
		transformOrderedList(node as OrderedListNode, context),
	[DocumentationNodeType.Paragraph]: (node, context): HastNode =>
		transformChildrenUnderTag({ name: "p" }, (node as ParagraphNode).children, context),
	[DocumentationNodeType.PlainText]: (node, context): HastNode =>
		transformPlainText(node as PlainTextNode, context),
	[DocumentationNodeType.Span]: (node, context): HastNode =>
		transformSpan(node as SpanNode, context),
	[DocumentationNodeType.Table]: (node, context): HastNode =>
		transformTable(node as TableNode, context),
	[DocumentationNodeType.TableCell]: (node, context): HastNode =>
		transformTableCell(node as TableCellNode, context),
	[DocumentationNodeType.TableRow]: (node, context): HastNode =>
		transformTableRow(node as TableRowNode, context),
	[DocumentationNodeType.UnorderedList]: (node, context): HastNode =>
		transformUnorderedList(node as UnorderedListNode, context),
};
