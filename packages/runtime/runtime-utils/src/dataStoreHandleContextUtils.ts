/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandleContext } from "@fluidframework/core-interfaces";

/**
 * Generates the absolute path for an IFluidHandleContext given its path and its parent routeContext.
 */
export function generateHandleContextPath(path: string, routeContext?: IFluidHandleContext): string {
    let result: string;

    if (path === "" || path === "/") {
        // The `path` is empty.
        // If the routeContext does not exist, this is the root.
        // If the routeContext exists, the absolute path is the same as that of the routeContext.
        result = routeContext === undefined ? "/" : routeContext.absolutePath;
    } else {
        // If the routeContext does not exist, path is the absolute path.
        // If the routeContext exists, absolute path is routeContext's absolute path plus the path.
        result = routeContext === undefined
            ? path.startsWith("/") ? path : `/${path}`
            : `${routeContext.absolutePath}/${path}`;
    }

    return result;
}
