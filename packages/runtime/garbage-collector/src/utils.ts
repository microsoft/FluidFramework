/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGraphNode } from "@fluidframework/runtime-definitions";

/**
 * Helper function that normalizes the ids of the given list of garbage collection nodes and prefixs them with the
 * given prefixId.
 * @param gcNodes - The list of GC nodes whose paths are to be normalized and prefixed.
 * @param prefixId - The id to prefix to the Fluid object references path.
 */
export function normalizeAndPrefixGCNodeIds(gcNodes: IGraphNode[], prefixId: string) {
    for (const node of gcNodes) {
        let normalizedId = node.id;
        // Remove any starting slashes from the id.
        while (normalizedId.startsWith("/")) {
            normalizedId = normalizedId.substr(1);
        }

        // Prefix the given id to the normalized id.
        normalizedId = `/${prefixId}/${normalizedId}`;

        // Remove any trailing slashes from the normalized id.
        while (normalizedId.endsWith("/")) {
            normalizedId = normalizedId.substr(0, normalizedId.length - 1);
        }

        node.id = normalizedId;
    }
}

/**
 * Helper function that clones the given list of garbage collection nodes.
 * @param gcNodes - The list of GC nodes to clone.
 * @returns a cloned list of the given GC nodes list.
 */
export function cloneGCNodes(gcNodes: IGraphNode[]): IGraphNode[] {
    const clonedNodes: IGraphNode[] = [];
    for (const node of gcNodes) {
        clonedNodes.push({
            id: node.id,
            outboundRoutes: [...node.outboundRoutes],
        });
    }
    return clonedNodes;
}

/**
 * Helper function that adds an outbound route to the given list of garbage collection nodes.
 * @param gcNodes - The list of GC nodes to add the route to.
 * @param route - The route to be added.
 */
export function addRouteToAllGCNodes(gcNodes: IGraphNode[], route: string) {
    for (const node of gcNodes) {
        node.outboundRoutes.push(route);
    }
}
