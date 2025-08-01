/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastNodes } from "hast";
import { h } from "hastscript";

import type {
	DocumentationNode,
	HeadingNode,
	LinkNode,
	SectionNode,
	ParagraphNode,
	SpanNode,
	TableCellNode,
	TableNode,
	TableRowNode,
	ListItemNode,
	ListNode,
	MarkdownBlockContentNode,
	MarkdownPhrasingContentNode,
} from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import {
	headingToHtml,
	sectionToHtml,
	linkToHtml,
	paragraphToHtml,
	spanToHtml,
	tableToHtml,
	tableCellToHtml,
	tableRowToHtml,
	listItemToHtml,
	listToHtml,
	markdownNodeToHtml,
} from "../default-transformations/index.js";

/**
 * Configuration for transforming {@link DocumentationNode}s to {@link https://github.com/syntax-tree/hast | hast},
 * specified by {@link DocumentationNode."type"}.
 *
 * @remarks
 *
 * The system supplies a suite of default transformations for all {@link DocumentationNode} types exported by this library.
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
const hastHorizontalRule = h("hr");

/**
 * Default {@link DocumentationNode} to {@link https://github.com/syntax-tree/hast | hast} transformations.
 */
export const defaultTransformations: Transformations = {
	heading: (node, context) => headingToHtml(node as HeadingNode, context),
	link: (node, context) => linkToHtml(node as LinkNode, context),
	listItem: (node, context) => listItemToHtml(node as ListItemNode, context),
	markdownBlockContent: (node, context) =>
		markdownNodeToHtml(node as MarkdownBlockContentNode, context),
	markdownPhrasingContent: (node, context) =>
		markdownNodeToHtml(node as MarkdownPhrasingContentNode, context),
	section: (node, context) => sectionToHtml(node as SectionNode, context),
	horizontalRule: () => hastHorizontalRule,
	list: (node, context) => listToHtml(node as ListNode, context),
	paragraph: (node, context) => paragraphToHtml(node as ParagraphNode, context),
	span: (node, context) => spanToHtml(node as SpanNode, context),
	table: (node, context) => tableToHtml(node as TableNode, context),
	tableCell: (node, context) => tableCellToHtml(node as TableCellNode, context),
	tableRow: (node, context) => tableRowToHtml(node as TableRowNode, context),
};
