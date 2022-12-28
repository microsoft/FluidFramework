/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    IGarbageCollectionData,
    IGarbageCollectionNodeData,
    IGarbageCollectionState,
    IGarbageCollectionDetailsBase,
    IGarbageCollectionSnapshotData,
    gcBlobPrefix,
    gcTombstoneBlobKey,
} from "@fluidframework/runtime-definitions";
/**
 * Trims the leading and trailing slashes from the given string.
 * @param str - A string that may contain leading and / or trailing slashes.
 * @returns A new string without leading and trailing slashes.
 */
export function trimLeadingAndTrailingSlashes(str: string) {
    return str.replace(/^\/+|\/+$/g, "");
}

/**
 * Trims the leading slashes from the given string.
 * @param str - A string that may contain leading slashes.
 * @returns A new string without leading slashes.
 */
export function trimLeadingSlashes(str: string) {
    return str.replace(/^\/+/g, "");
}

/**
 * Trims the trailing slashes from the given string.
 * @param str - A string that may contain trailing slashes.
 * @returns A new string without trailing slashes.
 */
export function trimTrailingSlashes(str: string) {
    return str.replace(/\/+$/g, "");
}

/**
 * Helper function that clones the GC data.
 * @param gcData - The GC data to clone.
 * @returns a clone of the given GC data.
 */
export function cloneGCData(gcData: IGarbageCollectionData): IGarbageCollectionData {
    const clonedGCNodes: { [ id: string ]: string[]; } = {};
    for (const [id, outboundRoutes] of Object.entries(gcData.gcNodes)) {
        clonedGCNodes[id] = Array.from(outboundRoutes);
    }
    return {
        gcNodes: clonedGCNodes,
    };
}

/**
 * Helper function that unpacks the GC details of the children from a given node's GC details.
 * @param gcDetails - The GC details of a node.
 * @returns A map of GC details of each children of the the given node.
 */
 export function unpackChildNodesGCDetails(gcDetails: IGarbageCollectionDetailsBase) {
    const childGCDetailsMap: Map<string, IGarbageCollectionDetailsBase> = new Map();

    // If GC data is not available, bail out.
    if (gcDetails.gcData === undefined) {
        return childGCDetailsMap;
    }

    const gcNodes = gcDetails.gcData.gcNodes;
    for (const [id, outboundRoutes] of Object.entries(gcNodes)) {
        // Skip self-node since only children GC data is to be generated.
        if (id === "/") {
            continue;
        }

        assert(id.startsWith("/"), 0x2ae /* "node id should always be an absolute route" */);
        const childId = id.split("/")[1];
        let childGCNodeId = id.slice(childId.length + 1);
        // GC node id always begins with "/". Handle the special case where a child's id in the parent's GC nodes is
        // of format `/root`. In this case, the childId is root and childGCNodeId is "". Make childGCNodeId = "/".
        if (childGCNodeId === "") {
            childGCNodeId = "/";
        }

        let childGCDetails = childGCDetailsMap.get(childId);
        if (childGCDetails === undefined) {
            childGCDetails = { gcData: { gcNodes: {} }, usedRoutes: [] };
        }
        // gcData should not undefined as its always at least initialized as  empty above.
        assert(childGCDetails.gcData !== undefined, 0x2af /* "Child GC data should have been initialized" */);
        childGCDetails.gcData.gcNodes[childGCNodeId] = [...new Set(outboundRoutes)];
        childGCDetailsMap.set(childId, childGCDetails);
    }

    if (gcDetails.usedRoutes === undefined) {
        return childGCDetailsMap;
    }

    // Remove the node's self used route, if any, and generate the children used routes.
    const usedRoutes = gcDetails.usedRoutes.filter((route) => route !== "" && route !== "/");
    for (const route of usedRoutes) {
        assert(route.startsWith("/"), 0x2b0 /* "Used route should always be an absolute route" */);
        const childId = route.split("/")[1];
        const childUsedRoute = route.slice(childId.length + 1);

        const childGCDetails = childGCDetailsMap.get(childId);
        assert(
            childGCDetails?.usedRoutes !== undefined,
            0x2b1 /* "This should have be initiallized when generate GC nodes above" */,
        );

        childGCDetails.usedRoutes.push(childUsedRoute);
        childGCDetailsMap.set(childId, childGCDetails);
    }
    return childGCDetailsMap;
}

/**
 * Helper function that unpacks the used routes of children from a given node's used routes.
 * @param usedRoutes - The used routes of a node.
 * @returns A map of used routes of each children of the the given node.
 */
export function unpackChildNodesUsedRoutes(usedRoutes: string[]) {
    // Remove the node's self used route, if any, and generate the children used routes.
    const filteredUsedRoutes = usedRoutes.filter((route) => route !== "" && route !== "/");
    const childUsedRoutesMap: Map<string, string[]> = new Map();
    for (const route of filteredUsedRoutes) {
        assert(route.startsWith("/"), 0x198 /* "Used route should always be an absolute route" */);
        const childId = route.split("/")[1];
        const childUsedRoute = route.slice(childId.length + 1);

        const childUsedRoutes = childUsedRoutesMap.get(childId);
        if (childUsedRoutes !== undefined) {
            childUsedRoutes.push(childUsedRoute);
        } else {
            childUsedRoutesMap.set(childId, [childUsedRoute]);
        }
    }
    return childUsedRoutesMap;
}

/**
 * Removes the given route from the outbound routes of all the given GC nodes, and any duplicates
 * @param gcNodes - The nodes from which the route is to be removed.
 * @param outboundRoute - The route to be removed.
 */
export function removeRouteFromAllNodes(gcNodes: { [ id: string ]: string[]; }, outboundRoute: string) {
    const channels = Object.entries(gcNodes);
    for (const [nodeId, outboundRoutes] of channels) {
        // Remove route from channel to parent for each channel
        const outboundRoutesSet = new Set(outboundRoutes);
        outboundRoutesSet.delete(outboundRoute);
        gcNodes[nodeId] = [...outboundRoutesSet];
    }
}

/**
 * Concatenates the given GC states and returns the concatenated GC state.
 */
export function concatGarbageCollectionStates(
    gcState1: IGarbageCollectionState,
    gcState2: IGarbageCollectionState,
): IGarbageCollectionState {
    const combinedGCNodes: { [ id: string ]: IGarbageCollectionNodeData; } = {};
    for (const [nodeId, nodeData] of Object.entries(gcState1.gcNodes)) {
        combinedGCNodes[nodeId] = {
            outboundRoutes: Array.from(nodeData.outboundRoutes),
            unreferencedTimestampMs: nodeData.unreferencedTimestampMs,
        };
    }

    for (const [nodeId, nodeData] of Object.entries(gcState2.gcNodes)) {
        let combinedNodedata = combinedGCNodes[nodeId];
        if (combinedNodedata === undefined) {
            combinedNodedata = {
                outboundRoutes: Array.from(nodeData.outboundRoutes),
                unreferencedTimestampMs: nodeData.unreferencedTimestampMs,
            };
        } else {
            // Validate that same node doesn't have different unreferenced timestamp.
            if (nodeData.unreferencedTimestampMs !== undefined
                && combinedNodedata.unreferencedTimestampMs !== undefined) {
                assert(nodeData.unreferencedTimestampMs === combinedNodedata.unreferencedTimestampMs,
                    0x2b2 /* "Two entries for the same GC node with different unreferenced timestamp" */);
            }
            combinedNodedata = {
                outboundRoutes: [...new Set([...nodeData.outboundRoutes, ...combinedNodedata.outboundRoutes])],
                unreferencedTimestampMs: nodeData.unreferencedTimestampMs ?? combinedNodedata.unreferencedTimestampMs,
            };
        }
        combinedGCNodes[nodeId] = combinedNodedata;
    }
    return { gcNodes: combinedGCNodes };
}

/**
 * Concatenates the given GC datas and returns the concatenated GC data.
 */
export function concatGarbageCollectionData(gcData1: IGarbageCollectionData, gcData2: IGarbageCollectionData) {
    const combinedGCData: IGarbageCollectionData = cloneGCData(gcData1);
    for (const [id, routes] of Object.entries(gcData2.gcNodes)) {
        if (combinedGCData.gcNodes[id] === undefined) {
            combinedGCData.gcNodes[id] = Array.from(routes);
        } else {
            const combinedRoutes = [...routes, ...combinedGCData.gcNodes[id]];
            combinedGCData.gcNodes[id] = [...new Set(combinedRoutes)];
        }
    }
    return combinedGCData;
}

export class GCDataBuilder implements IGarbageCollectionData {
    private readonly gcNodesSet: { [ id: string ]: Set<string>; } = {};
    public get gcNodes(): { [ id: string ]: string[]; } {
        const gcNodes = {};
        for (const [nodeId, outboundRoutes] of Object.entries(this.gcNodesSet)) {
            gcNodes[nodeId] = [...outboundRoutes];
        }
        return gcNodes;
    }

    public addNode(id: string, outboundRoutes: string[]) {
        this.gcNodesSet[id] = new Set(outboundRoutes);
    }

    /**
     * Adds the given GC nodes. It does the following:
     * - Normalizes the ids of the given nodes.
     * - Prefixes the given `prefixId` to the given nodes' ids.
     * - Adds the outbound routes of the nodes against the normalized and prefixed id.
     */
    public prefixAndAddNodes(prefixId: string, gcNodes: { [ id: string ]: string[]; }) {
        for (const [id, outboundRoutes] of Object.entries(gcNodes)) {
            // Remove any leading slashes from the id.
            let normalizedId = trimLeadingSlashes(id);
            // Prefix the given id to the normalized id.
            normalizedId = `/${prefixId}/${normalizedId}`;
            // Remove any trailing slashes from the normalized id. Note that the trailing slashes are removed after
            // adding the prefix for handling the special case where id is "/".
            normalizedId = trimTrailingSlashes(normalizedId);

            // Add the outbound routes against the normalized and prefixed id without duplicates.
            this.gcNodesSet[normalizedId] = new Set(outboundRoutes);
        }
    }

    public addNodes(gcNodes: { [ id: string ]: string[]; }) {
        for (const [id, outboundRoutes] of Object.entries(gcNodes)) {
            this.gcNodesSet[id] = new Set(outboundRoutes);
        }
    }

    /**
     * Adds the given outbound route to the outbound routes of all GC nodes.
     */
    public addRouteToAllNodes(outboundRoute: string) {
        for (const outboundRoutes of Object.values(this.gcNodesSet)) {
            outboundRoutes.add(outboundRoute);
        }
    }

    public getGCData(): IGarbageCollectionData {
        return {
            gcNodes: this.gcNodes,
        };
    }
}

/**
 * Gets the base garbage collection state from the given snapshot tree. It contains GC state and tombstone state.
 * The GC state may be written into multiple blobs. Merge the GC state from all such blobs into one.
 */
export async function getGCDataFromSnapshot(
    gcSnapshotTree: ISnapshotTree,
    readAndParseBlob: <T>(id: string) => Promise<T>,
): Promise<IGarbageCollectionSnapshotData> {
    let rootGCState: IGarbageCollectionState = { gcNodes: {} };
    let tombstones: string[] | undefined;
    for (const key of Object.keys(gcSnapshotTree.blobs)) {
        if (key === gcTombstoneBlobKey) {
            tombstones = await readAndParseBlob<string[]>(gcSnapshotTree.blobs[key]);
            continue;
        }

        // Skip blobs that do not start with the GC prefix.
        if (!key.startsWith(gcBlobPrefix)) {
            continue;
        }

        const blobId = gcSnapshotTree.blobs[key];
        if (blobId === undefined) {
            continue;
        }
        const gcState = await readAndParseBlob<IGarbageCollectionState>(blobId);
        assert(gcState !== undefined, 0x2ad /* "GC blob missing from snapshot" */);
        // Merge the GC state of this blob into the root GC state.
        rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
    }
    return { gcState: rootGCState, tombstones };
}
