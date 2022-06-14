/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IGCResult } from "./interfaces";

/**
 * Runs garbage collection on the given reference graph.
 * @param referenceGraph - The reference graph to run GC on. It's a list of nodes where each node has an id and set of
 * routes to other nodes in the graph.
 * @param rootIds - The ids of root nodes that are considered referenced.
 * @param logger - Used to log telemetry.
 * @returns the ids of referenced nodes and the ids of deleted nodes in the referenced graph.
 */
export function runGarbageCollection(
    referenceGraph: { [id: string]: string[]; },
    rootIds: string[],
    logger: ITelemetryLogger,
): IGCResult {
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
        const routes = referenceGraph[id];
        if (routes !== undefined) {
            referencedIds.push(...routes);
        } else {
            // Log a telemetry event if there is a node missing for a referenced id. This should not happen but for now
            // we don't assert. We can monitor telemetry for a while to figure out next steps.

            /*
             * This telemetry is currently too noisy. Start sending it GC is enabled end-to-end. See here for details -
             * https://github.com/microsoft/FluidFramework/issues/4939
             *
             * logger.sendTelemetryEvent({
             *    eventName: "MissingGCNode",
             *    missingNodeId: id,
             * });
            */
        }
    }

    const referencedNodeIds: string[] = [];
    const deletedNodeIds: string[] = [];
    for (const id of Object.keys(referenceGraph)) {
        // The nodes from the reference graph whose ids are in the visited list are referenced.
        // The rest of the nodes are deleted.
        if (visited.has(id)) {
            referencedNodeIds.push(id);
        } else {
            deletedNodeIds.push(id);
        }
    }
    return { referencedNodeIds, deletedNodeIds };
}
