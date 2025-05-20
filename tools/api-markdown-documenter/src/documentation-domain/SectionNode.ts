/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent } from "./BlockContent.js";
import {
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import type { HeadingNode } from "./HeadingNode.js";

/**
 * Union of all kinds of {@link DocumentationNode} that can occur as children of {@link SectionNode}
 *
 * @remarks To register custom nodes, add them to {@link BlockContentMap}.
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
 * @public
 */
export class SectionNode
	extends DocumentationParentNodeBase<SectionContent>
	implements MultiLineDocumentationNode
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Section;

	/**
	 * Optional heading to display for the section.
	 *
	 * @remarks If not specified, no heading will be displayed in the section contents.
	 * Note that this section will still influence heading hierarchy of child contents regardless.
	 */
	public readonly heading?: HeadingNode;

	/**
	 * Empty section singleton.
	 */
	public static readonly Empty = new SectionNode([]);

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	public constructor(children: SectionContent[], heading?: HeadingNode) {
		super(children);

		this.heading = heading;
	}
}
