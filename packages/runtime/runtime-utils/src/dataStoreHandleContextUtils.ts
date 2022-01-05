/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandleContext } from "@fluidframework/core-interfaces";

/**
 * Generates the absolute path for a Fluid object given its path and its parent routeContext.
 * @param path - The path to the Fluid object relative to the route context.
 * @param routeContext - The route context that contains the Fluid object.
 * @returns The absolute path to the Fluid object from the root of the Container.
 */
export function generateHandleContextPath(path: string, routeContext?: IFluidHandleContext): string {
    if (path.includes("/")) {
        throw new Error(`The relative object path should not include slashes as it will interfere with url routing`);
    }

    if (path === "") {
        // The `path` is empty.
        // If the routeContext does not exist, this is the root.
        // If the routeContext exists, the absolute path is the same as that of the routeContext.
        return routeContext === undefined ? "/" : routeContext.absolutePath;
    } else {
        // If the routeContext does not exist, path is the absolute path.
        // If the routeContext exists, absolute path is routeContext's absolute path plus the path to the Fluid object.
        // Handle the special case where the routeContext is the root to avoid double slashes in the path.
        return routeContext === undefined
            ? `/${path}`
            : `${routeContext.absolutePath  === "/" ? "" : routeContext.absolutePath}/${path}`;
    }
}
