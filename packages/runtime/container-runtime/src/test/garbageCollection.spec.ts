/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    IGarbageCollectionData,
    IGarbageCollectionSummaryDetails,
} from "@fluidframework/runtime-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { GarbageCollector, IGarbageCollectionRuntime, IGarbageCollector } from "../garbageCollection";
import { gcBlobName } from "../summaryFormat";

describe("Garabge Collection Tests", () => {
    // Nodes in the reference graph.
    const nodes: string[] = [
        "/node1",
        "/node2",
        "/node3",
        "/node4",
    ];

    let mockLogger: MockLogger;

    // Time after which unreferenced nodes can be deleted.
    const deleteTimeoutMs = 500;
    const inactiveObjectRevivedEvent = "GarbageCollector:inactiveObjectRevived";
    const inactiveObjectChangedEvent = "GarbageCollector:inactiveObjectChanged";

    // The GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
    const gcData: IGarbageCollectionData = { gcNodes: {} };
    const getGCData = async (fullGC?: boolean) => gcData;
    const updateUsedRoutes = (usedRoutes: string[]) => {
        return { totalNodeCount: 0, unusedNodeCount: 0 };
    };
    // The runtime to be passed to the garbage collector.
    const gcRuntime: IGarbageCollectionRuntime = {
        getGCData,
        updateUsedRoutes,
    };

    // Waits for > deleteTimeoutMs. To be called to make sure that any unreferenced nodes have been deleted.
    async function waitForDeleteTimeout(): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, deleteTimeoutMs + 100);
        });
    }

    // Validates that no inactive event has been fired.
    function validateNoInactiveEvents() {
        assert(
            !mockLogger.matchAnyEvent([
                { eventName: inactiveObjectRevivedEvent },
                { eventName: inactiveObjectChangedEvent },
            ]),
            "inactive object events should not have been logged",
        );
    }

    // Simulates node changed activity for all the nodes in the graph.
    function changeAllNodes(garbageCollector: IGarbageCollector) {
        nodes.forEach((nodeId) => {
            garbageCollector.nodeChanged(nodeId);
        });
    }

    // Returns a dummy snapshot tree to be built upon.
    const getDummySnapshotTree = (): ISnapshotTree => {
        return {
            id: "dummy",
            blobs: {},
            commits: {},
            trees: {},
        };
    };

    // The GC details in the summary blob of a node. This is used by the garbage collector to initialize GC state.
    // Update this for individual node to update the initial GC state of that node.
    const emptyGCDetails: IGarbageCollectionSummaryDetails = {};

    const createGarbageCollector = (
        baseSnapshot: ISnapshotTree | undefined = undefined,
        getNodeGCDetails: (id: string) => IGarbageCollectionSummaryDetails = () => emptyGCDetails,
    ) => {
        return GarbageCollector.create(
            gcRuntime,
            { deleteTimeoutMs },
            (unusedRoutes: string[]) => {},
            () => Date.now(),
            baseSnapshot,
            async <T>(id: string) => getNodeGCDetails(id) as T,
            mockLogger,
            false /* existing */,
        );
    };

    beforeEach(async () => {
        mockLogger = new MockLogger();

        // Set up the reference graph such that all nodes are referenced. Add in a couple of cycles in the graph.
        gcData.gcNodes["/"] = [ nodes[0] ];
        gcData.gcNodes[nodes[0]] = [ nodes[1] ];
        gcData.gcNodes[nodes[1]] = [ nodes[0], nodes[2] ];
        gcData.gcNodes[nodes[2]] = [ nodes[3] ];
        gcData.gcNodes[nodes[3]] = [ nodes[0] ];
    });

    it("doesn't generate inactive events for referenced nodes", async () => {
        const garbageCollector = createGarbageCollector();

        // Run garbage collection on the default GC data where everything is referenced.
        await garbageCollector.collectGarbage({ runGC: true });

        // Change all nodes.
        changeAllNodes(garbageCollector);

        // Validate that no inactive events are generated yet.
        validateNoInactiveEvents();

        // Wait for unreferenced timer (if any) to expire.
        await waitForDeleteTimeout();

        // Change all nodes again.
        changeAllNodes(garbageCollector);

        // Validate that no inactive events are generated since everything is referenced.
        validateNoInactiveEvents();
    });

    it("generates inactive events when inactive node is changed or revived", async () => {
        const garbageCollector = createGarbageCollector();

        // Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
        gcData.gcNodes[nodes[1]] = [];

        await garbageCollector.collectGarbage({ runGC: true });

        // Change all nodes.
        changeAllNodes(garbageCollector);

        // Validate that no inactive events are generated yet.
        validateNoInactiveEvents();

        // Wait for unreferenced timer (if any) to expire.
        await waitForDeleteTimeout();

        // Change all nodes. This should result in an inactiveObjectChanged event for node 2 and node 3 since they
        // are inactive.
        changeAllNodes(garbageCollector);
        assert(
            mockLogger.matchEvents([
                { eventName: inactiveObjectChangedEvent, deleteTimeoutMs, inactiveNodeId: nodes[2] },
                { eventName: inactiveObjectChangedEvent, deleteTimeoutMs, inactiveNodeId: nodes[3] },
            ]),
            "inactiveObjectChanged event not generated as expected",
        );

        // Add reference to node 3 from node 1.
        gcData.gcNodes[nodes[1]] = [ nodes[3] ];

        // Run GC and validate that we get inactiveObjectRevived for node 3.
        await garbageCollector.collectGarbage({ runGC: true });
        assert(
            mockLogger.matchEvents([
                { eventName: inactiveObjectRevivedEvent, deleteTimeoutMs, inactiveNodeId: nodes[3] },
            ]),
            "inactiveObjectRevived event not generated as expected",
        );
    });

    it("generates inactive events once per node", async () => {
        const garbageCollector = createGarbageCollector();

        // Remove node 3's reference from node 2.
        gcData.gcNodes[nodes[2]] = [];

        await garbageCollector.collectGarbage({ runGC: true });

        await waitForDeleteTimeout();

        // Change all nodes. This should result in an inactiveObjectChanged event for node 2 and node 3 since they
        // are inactive.
        changeAllNodes(garbageCollector);
        assert(
            mockLogger.matchEvents([
                { eventName: inactiveObjectChangedEvent, deleteTimeoutMs, inactiveNodeId: nodes[3] },
            ]),
            "inactiveObjectChanged event not generated as expected",
        );

        // Change all nodes. There shouldn't be any more inactive events since for each node the event is only
        // once.
        changeAllNodes(garbageCollector);
        validateNoInactiveEvents();
    });

    it("generates inactive events for nodes that are inactive on load", async () => {
        // Create GC details for node 3's GC blob whose unreferenced time was > deleteTimeoutMs ago.
        // This means this node should become inactive as soon as its data is loaded.
        const node3GCDetails: IGarbageCollectionSummaryDetails = {
            gcData: { gcNodes: { "/": [] } },
            unrefTimestamp: Date.now() - (deleteTimeoutMs + 100),
        };
        const node3Snapshot = getDummySnapshotTree();
        node3Snapshot.blobs[gcBlobName] = "node3GCDetails";

        // Create a base snapshot that contains snapshot tree of node 3.
        const baseSnapshot = getDummySnapshotTree();
        baseSnapshot.trees[nodes[3].slice(1)] = node3Snapshot;

        // Set up the getNodeGCDetails function to return the GC details for node 3 when asked by garbage collector.
        const getNodeGCDetails = (blobId: string) => {
            if (blobId === "node3GCDetails") {
                return node3GCDetails;
            }
            return {};
        };
        const garbageCollector = createGarbageCollector(baseSnapshot, getNodeGCDetails);

        // Remove node 3's reference from node 2 so that it is still unreferenced. The GC details from the base summary
        // are not loaded until the first time GC is run, so do that immediately.
        gcData.gcNodes[nodes[2]] = [];
        await garbageCollector.collectGarbage({ runGC: true });

        // Change node 3. This should result in an inactiveObjectChanged event for it since it should be inactive.
        garbageCollector.nodeChanged(nodes[3]);
        assert(
            mockLogger.matchEvents([
                { eventName: inactiveObjectChangedEvent, deleteTimeoutMs, inactiveNodeId: nodes[3] },
            ]),
            "inactiveObjectChanged event not generated as expected",
        );

        // Add a reference to node 3 from node 2. Run GC and validate that we get inactiveObjectRevived for node 3.
        gcData.gcNodes[nodes[2]] = [ nodes[3] ];
        await garbageCollector.collectGarbage({ runGC: true });
        assert(
            mockLogger.matchEvents([
                { eventName: inactiveObjectRevivedEvent, deleteTimeoutMs, inactiveNodeId: nodes[3] },
            ]),
            "inactiveObjectRevived event not generated as expected",
        );
    });
});
