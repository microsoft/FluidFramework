/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Node } from "mdast";

/**
 * The heading of a {@link HierarchicalSection} with a dynamic level.
 *
 * @remarks The level is determined by the nesting of the containing section.
 *
 * @sealed
 * @public
 */
export interface SectionHeading extends Node {
	/**
	 * `mdast` node type.
	 */
	type: "sectionHeading";

	// TODO: there is no reason not to just take `PhrasingContent` here, but the library doesn't currently utilize that degree of freedom.
	/**
	 * Section contents.
	 */
	title: string;

	/**
	 * Identifier to associate with the heading.
	 *
	 * @remarks Must be unique in a given document.
	 *
	 * @defaultValue No explicit identifier is associated with the heading.
	 * Links will have to refer to the heading by its title contents.
	 */
	id?: string;
}
