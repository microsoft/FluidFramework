/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent, Node } from "mdast";

import type { SectionHeading } from "./SectionHeading.js";

// TODO: Hierarchical sections should really be either or in terms of what kinds of children they can have.
// Either they have `HierarchicalSection` children, or they have `BlockContent` children, but they shouldn't mix and match.
// Block content following a hierarchical section will otherwise be considered part of preceeding section, rather than a sibling section.

/**
 * Represents a hierarchically nested section.
 * @remarks Influences things like automatic heading level generation.
 * @sealed
 * @public
 */
export interface HierarchicalSection extends Node {
	/**
	 * `mdast` node type.
	 */
	type: "hierarchicalSection";

	/**
	 * Section contents.
	 */
	children: BlockContent[];

	/**
	 * Optional heading to display for the section.
	 *
	 * @remarks If not specified, no heading will be displayed in the section contents.
	 * Note that this section will still influence heading hierarchy of child contents regardless.
	 */
	heading?: SectionHeading;
}

/**
 * Wraps the provided contents in a {@link HierarchicalSection}.
 * @param nodes - The section's child contents.
 * @param heading - Optional heading to associate with the section.
 */
export function createHierarchicalSection({
	children,
	heading,
}: { children: BlockContent[]; heading?: SectionHeading }): HierarchicalSection {
	const section: HierarchicalSection = {
		type: "hierarchicalSection",
		children,
	};

	// Only append `heading` property if specified to avoid clutter in the generated nodes.
	if (heading !== undefined) {
		section.heading = heading;
	}

	return section;
}

// Extend the mdast to include `HierarchicalSection` in "block content" and "root content" contexts
declare module "mdast" {
	interface BlockContentMap {
		hierarchicalSection: HierarchicalSection;
	}
	interface RootContentMap {
		hierarchicalSection: HierarchicalSection;
	}
}
