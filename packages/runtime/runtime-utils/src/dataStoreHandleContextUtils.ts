/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";

/**
 * Generates the absolute path for a Fluid object given its path and its parent routeContext.
 * @param path - The path to the Fluid object relative to the route context.
 * @param routeContext - The route context that contains the Fluid object.
 * @returns The absolute path to the Fluid object from the root of the Container.
 * @internal
 */
export function generateHandleContextPath(
	path: string,
	routeContext?: IFluidHandleContext,
): string {
	if (path === "") {
		// The `path` is empty.
		// If the routeContext does not exist, this is the root.
		// If the routeContext exists, the absolute path is the same as that of the routeContext.
		return routeContext === undefined ? "" : routeContext.absolutePath;
	} else {
		// Remove beginning and trailing slashes, if any, from the path.
		let normalizedPath = path.startsWith("/") ? path.slice(1) : path;
		normalizedPath = normalizedPath.endsWith("/")
			? normalizedPath.slice(0, -1)
			: normalizedPath;

		// If the routeContext does not exist, path is the absolute path.
		// If the routeContext exists, absolute path is routeContext's absolute path plus the path.
		return routeContext === undefined
			? `/${normalizedPath}`
			: `${
					routeContext.absolutePath === "/" ? "" : routeContext.absolutePath
				}/${normalizedPath}`;
	}
}
