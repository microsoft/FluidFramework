/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent, Node } from "mdast";

import type { HeadingNode } from "./HeadingNode.js";

/**
 * Union of the kinds of nodes that can occur as children of {@link SectionNode}
 *
 * @public
 */
export type SectionContent = BlockContent | SectionNode;

/**
 * Represents a hierarchically nested section.
 * Influences things like automatic heading level generation.
 *
 * @example Markdown
 *
 * ```md
 * # Heading Text
 *
 * Section contents...
 * ```
 *
 * @example HTML
 *
 * ```html
 * <section>
 * 	<h1>
 * 		Heading Text
 * 	</h1>
 * 	Section contents...
 * </section>
 * ```
 *
 * @sealed
 * @public
 */
export class SectionNode implements Node {
	public readonly type = "section";

	public constructor(
		/**
		 * The section's contents
		 */
		public readonly children: readonly SectionContent[],
		/**
		 * Optional heading to display for the section.
		 *
		 * @remarks If not specified, no heading will be displayed in the section contents.
		 * Note that this section will still influence heading hierarchy of child contents regardless.
		 */
		public readonly heading?: HeadingNode,
	) {}
}
