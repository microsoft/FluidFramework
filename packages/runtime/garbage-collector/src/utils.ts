/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGCData, IGraphNode } from "@fluidframework/runtime-definitions";

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
 * Helper function that clones the GC data.
 * @param gcData - The GC data to clone.
 * @returns a clone of the given GC data.
 */
export function cloneGCData(gcData: IGCData): IGCData {
    const clonedGCNodes: { [ id: string ]: string[] } = {};
    for (const [id, outboundRoutes] of Object.entries(gcData.gcNodes)) {
        clonedGCNodes[id] = Array.from(outboundRoutes);
    }
    return {
        gcNodes: clonedGCNodes,
    };
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

export class GCDataBuilder implements IGCData {
    public readonly gcNodes: { [ id: string ]: string[] } = {};

    public addGCNode(id: string, outboundRoutes: string[]) {
        this.gcNodes[id] = outboundRoutes;
    }

    /**
     * Adds the given GC nodes. It does the following:
     * - Normalizes the ids of the given nodes.
     * - Prefixes the given `prefixId` to the given nodes' ids.
     * - Adds the outbound routes of the nodes against the normalized and prefixed id.
     */
    public prefixAndAddGCNodes(prefixId: string, gcNodes: { [ id: string ]: string[] }) {
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
    public addRouteToAllGCNodes(outboundRoute: string) {
        for (const outboundRoutes of Object.values(this.gcNodes)) {
            outboundRoutes.push(outboundRoute);
        }
    }

    public getGCData(): IGCData {
        return {
            gcNodes: this.gcNodes,
        };
    }
}
