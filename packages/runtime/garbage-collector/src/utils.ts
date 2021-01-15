/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions";

/**
 * Helper function that clones the GC data.
 * @param gcData - The GC data to clone.
 * @returns a clone of the given GC data.
 */
export function cloneGCData(gcData: IGarbageCollectionData): IGarbageCollectionData {
    const clonedGCNodes: { [ id: string ]: string[] } = {};
    for (const [id, outboundRoutes] of Object.entries(gcData.gcNodes)) {
        clonedGCNodes[id] = Array.from(outboundRoutes);
    }
    return {
        gcNodes: clonedGCNodes,
    };
}

/**
 * Helper function that generates the used routes of the children from a given node's used routes.
 * @param usedRoutes - The used routes of a node.
 * @returns A map of used routes of each children of the the given node.
 */
export function getChildNodesUsedRoutes(usedRoutes: string[]) {
    const usedNodesRoutes: Map<string, string[]> = new Map();
    for (const route of usedRoutes) {
        assert(route.startsWith("/"), "Used route should always be an absolute route");
        const childId = route.split("/")[1];
        const childUsedRoute = route.slice(childId.length + 1);

        const childUsedRoutes = usedNodesRoutes.get(childId);
        if (childUsedRoutes !== undefined) {
            childUsedRoutes.push(childUsedRoute);
        } else {
            usedNodesRoutes.set(childId, [ childUsedRoute ]);
        }
    }
    return usedNodesRoutes;
}

export class GCDataBuilder implements IGarbageCollectionData {
    public readonly gcNodes: { [ id: string ]: string[] } = {};

    public addNode(id: string, outboundRoutes: string[]) {
        this.gcNodes[id] = outboundRoutes;
    }

    /**
     * Adds the given GC nodes. It does the following:
     * - Normalizes the ids of the given nodes.
     * - Prefixes the given `prefixId` to the given nodes' ids.
     * - Adds the outbound routes of the nodes against the normalized and prefixed id.
     */
    public prefixAndAddNodes(prefixId: string, gcNodes: { [ id: string ]: string[] }) {
        for (const [id, outboundRoutes] of Object.entries(gcNodes)) {
            let normalizedId = id;
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

            // Add the outbound routes against the normalized and prefixed id.
            this.gcNodes[normalizedId] = outboundRoutes;
        }
    }

    /**
     * Adds the given outbound route to the outbound routes of all GC nodes.
     */
    public addRouteToAllNodes(outboundRoute: string) {
        for (const outboundRoutes of Object.values(this.gcNodes)) {
            outboundRoutes.push(outboundRoute);
        }
    }

    public getGCData(): IGarbageCollectionData {
        return {
            gcNodes: this.gcNodes,
        };
    }
}
