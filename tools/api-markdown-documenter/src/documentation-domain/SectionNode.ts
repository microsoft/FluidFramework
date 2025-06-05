/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type DocumentationNode,
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import type { HeadingNode } from "./HeadingNode.js";

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
	extends DocumentationParentNodeBase
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

	public constructor(children: DocumentationNode[], heading?: HeadingNode) {
		super(children);

		this.heading = heading;
	}

	/**
	 * Merges a list of {@link SectionNode}s into a single section.
	 *
	 * @remarks This is an option if you wish to group a series of sections without putting them under some parent section
	 * (which would affect the hierarchy).
	 * @param sections - The sections to merge.
	 */
	public static combine(...sections: SectionNode[]): SectionNode {
		if (sections.length === 0) {
			return SectionNode.Empty;
		}

		if (sections.length === 1) {
			return sections[0];
		}

		const childNodes: DocumentationNode[] = [];
		for (const section of sections) {
			if (section.heading !== undefined) {
				childNodes.push(section.heading);
			}
			childNodes.push(...section.children);
		}
		return new SectionNode(childNodes, undefined);
	}
}
