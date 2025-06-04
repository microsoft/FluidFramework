/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Nodes as MdastTree,
	BlockContent as MdastBlockContent,
	Heading as MdastHeading,
	PhrasingContent as MdastPhrasingContent,
	RootContent as MdastRootContent,
	TableCell as MdastTableCell,
	TableRow as MdastTableRow,
} from "mdast";

import {
	type BlockContentMap,
	type PhrasingContentMap,
	DocumentationNodeType,
	type DocumentationNode,
	type SectionNode,
	type TableCellNode,
	type TableRowNode,
	type HeadingNode,
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
 */
export type BlockContentTransformations = {
	readonly [K in keyof BlockContentMap]: Transformation<BlockContentMap[K], MdastBlockContent>;
};

/**
 * TODO
 */
export type PhrasingContentTransformations = {
	readonly [K in keyof PhrasingContentMap]: Transformation<
		PhrasingContentMap[K],
		MdastPhrasingContent
	>;
};

/**
 * TODO
 */
export type Transformations = BlockContentTransformations &
	PhrasingContentTransformations & {
		readonly [DocumentationNodeType.Heading]: Transformation<HeadingNode, MdastHeading>;
		readonly [DocumentationNodeType.Section]: Transformation<SectionNode, MdastRootContent>;
		readonly [DocumentationNodeType.TableCell]: Transformation<TableCellNode, MdastTableCell>;
		readonly [DocumentationNodeType.TableRow]: Transformation<TableRowNode, MdastTableRow>;
	};

/**
 * Transformation from a {@link DocumentationNode} to a {@link https://github.com/syntax-tree/hast | HTML syntax tree}.
 *
 * @param node - The input node to be transformed.
 * @param context - Transformation context, including custom transformation implementations.
 *
 * @beta
 */
export type Transformation<
	TIn extends DocumentationNode = DocumentationNode,
	TOut extends MdastTree = MdastTree,
> = (node: TIn, context: TransformationContext) => TOut;

/**
 * Default {@link DocumentationNode} to {@link https://github.com/syntax-tree/hast | hast} transformations.
 */
export const defaultTransformations: Transformations = {
	[DocumentationNodeType.BlockQuote]: blockQuoteToMarkdown,
	[DocumentationNodeType.CodeSpan]: codeSpanToMarkdown,
	[DocumentationNodeType.FencedCode]: fencedCodeBlockToMarkdown,
	[DocumentationNodeType.Heading]: headingToMarkdown,
	[DocumentationNodeType.LineBreak]: lineBreakToMarkdown,
	[DocumentationNodeType.Link]: linkToMarkdown,
	[DocumentationNodeType.Section]: sectionToMarkdown,
	[DocumentationNodeType.HorizontalRule]: horizontalRuleToMarkdown,
	[DocumentationNodeType.OrderedList]: orderedListToMarkdown,
	[DocumentationNodeType.Paragraph]: paragraphToMarkdown,
	[DocumentationNodeType.PlainText]: plainTextToMarkdown,
	[DocumentationNodeType.Span]: spanToMarkdown,
	[DocumentationNodeType.Table]: tableToMarkdown,
	[DocumentationNodeType.TableCell]: tableCellToMarkdown,
	[DocumentationNodeType.TableRow]: tableRowToMarkdown,
	[DocumentationNodeType.UnorderedList]: unorderedListToMarkdown,
};
