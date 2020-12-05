/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IGraphNode } from "@fluidframework/runtime-definitions";
import { IGCResult } from "./interfaces";

/**
 * Runs garbage collection on the given reference graph.
 * @param referenceGraph - The reference graph to run GC on.
 * @param rootIds - The ids of root nodes that are considered referenced.
 * @param logger - Used to log telelmetry.
 * @returns a list of referenced nodes and a list of deleted nodes in the reference graph.
 */
export function runGarbageCollection(
    referenceGraph: IGraphNode[],
    rootIds: string[],
    logger: ITelemetryLogger,
): IGCResult {
    // Create a map of node id to node from the given reference Graph for quick node lookup.
    const referenceMap = createReferenceMap(referenceGraph);
    // This set keeps track of nodes that we have visited. It is used to detect cycles in the graph.
    const visited: Set<string> = new Set();

    // This tracks the ids of referenced nodes. The nodes corresponding to rootIds are always considered
    // referenced so we start with those.
    const referencedIds: string[] = [...rootIds];
    for (const id of referencedIds) {
        // If we have already seen this node, ignore and continue. Else, add it to visited list.
        if (visited.has(id)) {
            continue;
        }
        visited.add(id);

        // Get the node for the referenced id and add its outbound routes to referencedIds since they are
        // also referenced.
        const node = referenceMap.get(id);
        if (node !== undefined) {
            referencedIds.push(...node.outboundRoutes);
        } else {
            // Log a telemetry error if there
            logger.sendErrorEvent({
                eventName: "MissingGCNode",
                missingNodeId: id,
            });
        }
    }

    // The nodes that are referenced in the referenced graph are the ones that we have visited.
    // The nodes that we have not visited are deleted.
    const referencedNodes: IGraphNode[] = [];
    const deletedNodes: IGraphNode[] = [];
    for (const node of referenceGraph) {
        if (visited.has(node.id)) {
            referencedNodes.push(node);
        } else {
            deletedNodes.push(node);
        }
    }

    return { referencedNodes, deletedNodes };
}

function createReferenceMap(referenceGraph: IGraphNode[]) {
    const referencedMap: Map<string, IGraphNode> = new Map();
    for (const node of referenceGraph) {
        referencedMap.set(node.id, node);
    }
    return referencedMap;
}
