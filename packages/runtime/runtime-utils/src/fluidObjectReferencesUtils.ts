/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObjectReferences } from "@fluidframework/runtime-definitions";

/**
 * Helper function that normalizes the path of the given Fluid object references and prefixs them with the given id.
 * @param references - The list of Fluid object references whose paths are to be normalized and prefixed.
 * @param prefixId - The id to prefix to the Fluid object references path.
 */
export function normalizeAndPrefixReferencesPath(references: IFluidObjectReferences[], prefixId: string) {
    for (const reference of references) {
        let normalizedPath = reference.path;
        while (normalizedPath.startsWith("/")) {
            normalizedPath = normalizedPath.substr(1);
        }
        while (normalizedPath.endsWith("/")) {
            normalizedPath = normalizedPath.substr(0, normalizedPath.length - 1);
        }
        reference.path = `${prefixId}/${normalizedPath}`;
    }
}

/**
 * Helper function that clones the given list of Fluid object references.
 * @param references - The list of Fluid object references to be cloned.
 * @returns - A clone of the given Fluid object references.
 */
export function cloneFluidObjectReferences(references: IFluidObjectReferences[]): IFluidObjectReferences[] {
    const clonedReferences: IFluidObjectReferences[] = [];
    for (const reference of references) {
        clonedReferences.push({
            path: reference.path,
            routes: [...reference.routes],
        });
    }
    return clonedReferences;
}

/**
 * Helper function that adds a route to the routes of given Fluid object references.
 * @param references - The list of Fluid object references to add the route to.
 * @param route - The route to be added to the Fluid object references.
 */
export function addRouteToReferences(references: IFluidObjectReferences[], route: string) {
    for (const reference of references) {
        reference.routes.push(route);
    }
}
