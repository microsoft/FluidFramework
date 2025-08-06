/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastNodes } from "hast";
import type { Nodes } from "mdast";

import type { SectionHeading, Section } from "../../mdast/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { headingToHtml, sectionToHtml } from "../default-transformations/index.js";

/**
 * Configuration for transforming documentation to {@link https://github.com/syntax-tree/hast | hast},
 * specified by its "type".
 *
 * @remarks
 *
 * The system supplies a suite of default transformations for all documentation node types exported by this library.
 * For any other custom documentation nodes, transformations must be specified or the system will throw an error
 * when handling an unknown node kind.
 *
 * @public
 */
// Prefer index signature for documentation, since it allows documenting the key name.
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Transformations {
	/**
	 * Maps from a documentation node's "type" to a transformation implementation
	 * for that kind of node.
	 */
	readonly [documentationNodeKind: string]: Transformation;
}

/**
 * Transformation from a documentation node to a {@link https://github.com/syntax-tree/hast | HTML syntax tree}.
 *
 * @param node - The input node to be transformed.
 * @param context - Transformation context, including custom transformation implementations.
 *
 * @public
 */
export type Transformation = (
	node: Nodes | SectionHeading,
	context: TransformationContext,
) => HastNodes;

/**
 * Default documentation node to {@link https://github.com/syntax-tree/hast | hast} transformations.
 */
export const defaultTransformations: Transformations = {
	sectionHeading: (node, context) => headingToHtml(node as SectionHeading, context),
	section: (node, context) => sectionToHtml(node as Section, context),
};
