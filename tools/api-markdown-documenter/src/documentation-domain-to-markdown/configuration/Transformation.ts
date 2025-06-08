/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Nodes as MdastTree,
	BlockContent as MdastBlockContent,
	PhrasingContent as MdastPhrasingContent,
	RootContent as MdastRootContent,
	TableCell as MdastTableCell,
	TableRow as MdastTableRow,
} from "mdast";

import type {
	BlockContentMap,
	PhrasingContentMap,
	DocumentationNode,
	SectionNode,
	TableCellNode,
	TableRowNode,
	HeadingNode,
} from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import {
	blockQuoteToMarkdown,
	codeSpanToMarkdown,
	fencedCodeBlockToMarkdown,
	headingToMarkdown,
	horizontalRuleToMarkdown,
	sectionToMarkdown,
	lineBreakToMarkdown,
	linkToMarkdown,
	orderedListToMarkdown,
	paragraphToMarkdown,
	plainTextToMarkdown,
	spanToMarkdown,
	tableToMarkdown,
	tableCellToMarkdown,
	tableRowToMarkdown,
	unorderedListToMarkdown,
} from "../default-transformations/index.js";

/**
 * TODO
 * @public
 */
export type BlockContentTransformations = {
	readonly [K in keyof BlockContentMap]: Transformation<
		BlockContentMap[K],
		MdastBlockContent[]
	>;
};

/**
 * TODO
 * @public
 */
export type PhrasingContentTransformations = {
	readonly [K in keyof PhrasingContentMap]: Transformation<
		PhrasingContentMap[K],
		MdastPhrasingContent[]
	>;
};

/**
 * TODO
 * @public
 */
export type Transformations = BlockContentTransformations &
	PhrasingContentTransformations & {
		readonly ["heading"]: Transformation<HeadingNode, MdastBlockContent[]>;
		readonly ["section"]: Transformation<SectionNode, MdastRootContent[]>;
		readonly ["tableCell"]: Transformation<TableCellNode, [MdastTableCell]>;
		readonly ["tableRow"]: Transformation<TableRowNode, [MdastTableRow]>;
	};

/**
 * Transformation from a {@link DocumentationNode} to a {@link https://github.com/syntax-tree/hast | HTML syntax tree}.
 *
 * @param node - The input node to be transformed.
 * @param context - Transformation context, including custom transformation implementations.
 *
 * @public
 */
export type Transformation<
	TIn extends DocumentationNode = DocumentationNode,
	TOut extends MdastTree[] = [MdastTree],
> = (node: TIn, context: TransformationContext) => TOut;

/**
 * Default {@link DocumentationNode} to {@link https://github.com/syntax-tree/hast | hast} transformations.
 */
export const defaultTransformations: Transformations = {
	blockQuote: blockQuoteToMarkdown,
	codeSpan: codeSpanToMarkdown,
	fencedCode: fencedCodeBlockToMarkdown,
	heading: headingToMarkdown,
	lineBreak: lineBreakToMarkdown,
	link: linkToMarkdown,
	section: sectionToMarkdown,
	horizontalRule: horizontalRuleToMarkdown,
	orderedList: orderedListToMarkdown,
	paragraph: paragraphToMarkdown,
	text: plainTextToMarkdown,
	span: spanToMarkdown,
	table: tableToMarkdown,
	tableCell: tableCellToMarkdown,
	tableRow: tableRowToMarkdown,
	unorderedList: unorderedListToMarkdown,
};
