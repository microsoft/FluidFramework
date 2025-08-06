/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Nodes as MdastTree,
	BlockContent as MdastBlockContent,
	RootContent as MdastRootContent,
	Nodes,
} from "mdast";

import type { HierarchicalSection, IdentifiableHeading } from "../../mdast/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { headingToMarkdown, sectionToMarkdown } from "../default-transformations/index.js";

/**
 * Transformations from documentation nodes to {@link https://github.com/syntax-tree/mdast | Markdown syntax tree}s.
 *
 * @public
 */
export interface Transformations {
	readonly identifiableHeading: Transformation<IdentifiableHeading, MdastBlockContent[]>;
	readonly hierarchicalSection: Transformation<HierarchicalSection, MdastRootContent[]>;
}

/**
 * Transformation from a documentation node to a {@link https://github.com/syntax-tree/mdast | Markdown syntax tree}.
 *
 * @param node - The input node to be transformed.
 * @param context - Transformation context, including custom transformation implementations.
 *
 * @public
 */
export type Transformation<
	TIn extends Nodes | IdentifiableHeading = Nodes | IdentifiableHeading,
	TOut extends MdastTree[] = [MdastTree],
> = (node: TIn, context: TransformationContext) => TOut;

/**
 * Default documentation node to {@link https://github.com/syntax-tree/mdast | mdast} transformations.
 */
export const defaultTransformations: Transformations = {
	identifiableHeading: headingToMarkdown,
	hierarchicalSection: sectionToMarkdown,
};
