/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { HeadingNode } from "./HeadingNode";

// TODOs:
// - Only Documents and Sections may contain Sections?

/**
 * Represents a hierarchically nested section.
 * Influences things like automatic heading level generation, etc.
 *
 * @example TODO
 */
export class HierarchicalSectionNode extends ParentNodeBase {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.HierarchicalSection;

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
	public static readonly Empty = new HierarchicalSectionNode([]);

	public constructor(children: DocumentationNode[], heading?: HeadingNode) {
		super(children);

		this.heading = heading;
	}

	/**
	 * Merges a list of {@link HierarchicalSectionNode}s into a single section.
	 *
	 * @remarks This is an option if you wish to group a series of sections without putting them under some parent section
	 * (which would affect the hierarchy).
	 * @param sections - The sections to merge.
	 */
	public static combine(...sections: HierarchicalSectionNode[]): HierarchicalSectionNode {
		if (sections.length === 0) {
			return HierarchicalSectionNode.Empty;
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
		return new HierarchicalSectionNode(childNodes, undefined);
	}
}
