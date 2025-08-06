/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Nodes as MdastTree,
	BlockContent as MdastBlockContent,
	RootContent as MdastRootContent,
} from "mdast";

import type {
	DocumentationNode,
	SectionNode,
	HeadingNode,
} from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { headingToMarkdown, sectionToMarkdown } from "../default-transformations/index.js";

/**
 * Transformations from {@link DocumentationNode}s to {@link https://github.com/syntax-tree/mdast | Markdown syntax tree}s.
 *
 * @public
 */
export interface Transformations {
	readonly ["heading"]: Transformation<HeadingNode, MdastBlockContent[]>;
	readonly ["section"]: Transformation<SectionNode, MdastRootContent[]>;
}

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
	section: sectionToMarkdown,
};
