/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent, Parent } from "mdast";

import type { IdentifiableHeading } from "./IdentifiableHeading.js";

/**
 * Represents a hierarchically nested section.
 * @remarks Influences things like automatic heading level generation.
 */
export interface HierarchicalSection extends Parent {
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
	heading?: IdentifiableHeading;
}
