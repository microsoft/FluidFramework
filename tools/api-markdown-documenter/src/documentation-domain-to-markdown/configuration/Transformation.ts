/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Nodes as MdastTree,
	BlockContent as MdastBlockContent,
	ListItem as MdastListItem,
	RootContent as MdastRootContent,
} from "mdast";

import type {
	BlockContentMap,
	DocumentationNode,
	SectionNode,
	HeadingNode,
	ListItemNode,
} from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import {
	headingToMarkdown,
	sectionToMarkdown,
	listToMarkdown,
	listItemToMarkdown,
	markdownBlockContentNodeToMarkdown,
} from "../default-transformations/index.js";

/**
 * Transformations from {@link BlockContent} to {@link https://github.com/syntax-tree/mdast | Markdown syntax tree}s.
 *
 * @public
 */
export type BlockContentTransformations = {
	readonly [K in keyof BlockContentMap]: Transformation<
		BlockContentMap[K],
		MdastBlockContent[]
	>;
};

/**
 * Transformations from {@link DocumentationNode}s to {@link https://github.com/syntax-tree/mdast | Markdown syntax tree}s.
 *
 * @public
 */
export type Transformations = BlockContentTransformations & {
	readonly ["heading"]: Transformation<HeadingNode, MdastBlockContent[]>;
	readonly ["listItem"]: Transformation<ListItemNode, [MdastListItem]>;
	readonly ["section"]: Transformation<SectionNode, MdastRootContent[]>;
};

/**
 * Transformation from a {@link DocumentationNode} to a {@link https://github.com/syntax-tree/mdast | Markdown syntax tree}.
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
 * Default {@link DocumentationNode} to {@link https://github.com/syntax-tree/mdast | mdast} transformations.
 */
export const defaultTransformations: Transformations = {
	heading: headingToMarkdown,
	list: listToMarkdown,
	listItem: listItemToMarkdown,
	markdownBlockContent: markdownBlockContentNodeToMarkdown,
	section: sectionToMarkdown,
};
