/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IGraphNode } from "@fluidframework/runtime-definitions";

export interface IGCResult {
    referencedNodes: IGraphNode[];
    deletedNodes: IGraphNode[];
}

export interface IGarbageCollector {
    /**
     * Runs GC on the given reference graph. startingIds are ids of nodes from which the GC algorithm starts
     * and searches for other referenced nodes.
     */
    runGC(referenceGraph: IGraphNode[], startingIds: string[]): IGCResult;
}

export class GarbageCollector implements IGarbageCollector {
    constructor(private readonly logger: ITelemetryLogger) {}

    /**
     * Runs GC on the given reference graph.
     * @param referenceGraph - The reference graph to run GC on.
     * @param startingIds - The ids of initial nodes where GC starts its run.
     * @returns a list of referenced nodes and a list of deleted nodes in the reference graph.
     */
    public runGC(referenceGraph: IGraphNode[], startingIds: string[]): IGCResult {
        // Create a map of node id to node from the given reference Graph for quick node lookup.
        const referenceMap = this.createReferenceMap(referenceGraph);
        // This map keeps track of nodes that we have visited. It is used to detect cycles in the graph.
        const visited: Map<string, boolean> = new Map();

        // This tracks the ids of referenced nodes. This is starting ids to being with.
        const referencedIds: string[] = startingIds;
        for (const id of referencedIds) {
            // If we have already seen this node, ignore and continue. Else, add it to visited list.
            if (visited.has(id)) {
                continue;
            }
            visited.set(id, true);

            // Get the node for the referenced id and add its outbound routes to referencedIds since they are
            // also referenced.
            const node = referenceMap.get(id);
            if (node !== undefined) {
                referencedIds.push(...node.outboundRoutes);
            } else {
                // Log a telemetry error if there
                this.logger.sendErrorEvent({
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

    private createReferenceMap(referenceGraph: IGraphNode[]) {
        const referencedMap: Map<string, IGraphNode> = new Map();
        for (const node of referenceGraph) {
            referencedMap.set(node.id, node);
        }
        return referencedMap;
    }
}
