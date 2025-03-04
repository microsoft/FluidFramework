/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

/**
 * Helper function that unpacks the used routes of children from a given node's used routes.
 * @param usedRoutes - The used routes of a node.
 * @returns A map of used routes of each children of the the given node.
 * @internal
 */
export function unpackChildNodesUsedRoutes(
	usedRoutes: readonly string[],
): Map<string, string[]> {
	// Remove the node's self used route, if any, and generate the children used routes.
	const filteredUsedRoutes = usedRoutes.filter((route) => route !== "" && route !== "/");
	const childUsedRoutesMap: Map<string, string[]> = new Map();
	for (const route of filteredUsedRoutes) {
		assert(route.startsWith("/"), 0x5e0 /* Used route should always be an absolute route */);
		const childId = route.split("/")[1];
		assert(
			childId !== undefined,
			0x9ab /* childId is undefined in unpackChildNodesUsedRoutes */,
		);
		const childUsedRoute = route.slice(childId.length + 1);

		const childUsedRoutes = childUsedRoutesMap.get(childId);
		if (childUsedRoutes === undefined) {
			childUsedRoutesMap.set(childId, [childUsedRoute]);
		} else {
			childUsedRoutes.push(childUsedRoute);
		}
	}
	return childUsedRoutesMap;
}
