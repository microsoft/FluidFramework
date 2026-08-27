/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Heading } from "mdast";

import type { GeneratedRegion, ParsedDocument } from "./types.js";

/** Tests whether a source offset is inside a generated region body. */
function isInGeneratedRegion(offset: number, regions: readonly GeneratedRegion[]): boolean {
	return regions.some(
		(region) => offset > region.openingMarkerEnd && offset < region.closingMarkerStart,
	);
}

/**
 * Determines the heading depth for a generated section from its position in the document.
 *
 * A following authored heading defines the depth. Otherwise, the nearest preceding authored
 * heading defines the depth. A section after the document title starts at depth two. A section in
 * a document without authored headings starts at depth one.
 */
export function inferSectionHeadingDepth(
	document: ParsedDocument,
	regions: readonly GeneratedRegion[],
	region: GeneratedRegion,
): Heading["depth"] {
	const headings = document.tree.children.filter(
		(node): node is Heading =>
			node.type === "heading" &&
			node.position?.start.offset !== undefined &&
			!isInGeneratedRegion(node.position.start.offset, regions),
	);
	const followingHeading = headings.find(
		(heading) => (heading.position?.start.offset ?? 0) > region.closingMarkerStart,
	);
	if (followingHeading !== undefined) {
		return followingHeading.depth;
	}

	let precedingHeading: Heading | undefined;
	for (let index = headings.length - 1; index >= 0; index--) {
		const heading = headings[index];
		if (
			heading !== undefined &&
			(heading.position?.end.offset ?? Number.POSITIVE_INFINITY) < region.openingMarkerEnd
		) {
			precedingHeading = heading;
			break;
		}
	}
	if (precedingHeading === undefined) {
		return 1;
	}
	return precedingHeading.depth === 1 ? 2 : precedingHeading.depth;
}
