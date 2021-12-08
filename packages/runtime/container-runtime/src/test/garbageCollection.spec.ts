/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    gcBlobKey,
    IGarbageCollectionData,
    IGarbageCollectionNodeData,
    IGarbageCollectionState,
    IGarbageCollectionSummaryDetails,
} from "@fluidframework/runtime-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import {
    GarbageCollector,
    gcBlobPrefix,
    gcTreeKey,
    IGarbageCollectionRuntime,
    IGarbageCollector,
} from "../garbageCollection";

describe("Garbage Collection Tests", () => {
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

    // The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
    const defaultGCData: IGarbageCollectionData = { gcNodes: {} };
    const getGCData = async (fullGC?: boolean) => defaultGCData;
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
        defaultGCData.gcNodes["/"] = [ nodes[0] ];
        defaultGCData.gcNodes[nodes[0]] = [ nodes[1] ];
        defaultGCData.gcNodes[nodes[1]] = [ nodes[0], nodes[2] ];
        defaultGCData.gcNodes[nodes[2]] = [ nodes[3] ];
        defaultGCData.gcNodes[nodes[3]] = [ nodes[0] ];
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
        defaultGCData.gcNodes[nodes[1]] = [];

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
        defaultGCData.gcNodes[nodes[1]] = [ nodes[3] ];

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
        defaultGCData.gcNodes[nodes[2]] = [];

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
        // Create GC state where node 3's unreferenced time was > deleteTimeoutMs ago.
        // This means this node should become inactive as soon as its data is loaded.

        // Create a snapshot tree to be used as the GC snapshot tree.
        const gcSnapshotTree = getDummySnapshotTree();
        const gcBlobId = "gc_blob";
        // Add a GC blob with prefix `gcBlobPrefix` to the GC snapshot tree.
        gcSnapshotTree.blobs[`${gcBlobPrefix}_${gcBlobId}`] = gcBlobId;

        // Create a base snapshot that contains the GC snapshot tree.
        const baseSnapshot = getDummySnapshotTree();
        baseSnapshot.trees[gcTreeKey] = gcSnapshotTree;

        // Create GC state with node 3 expired. This will be returned when the garbage collector asks
        // for the GC blob with `gcBlobId`.
        const gcState: IGarbageCollectionState = { gcNodes: {} };
        const node3Data: IGarbageCollectionNodeData = {
            outboundRoutes: [],
            unreferencedTimestampMs: Date.now() - (deleteTimeoutMs + 100),
        };
        gcState.gcNodes[nodes[3]] = node3Data;

        // Set up the getNodeGCDetails function to return the GC details for node 3 when asked by garbage collector.
        const getNodeGCDetails = (blobId: string) => {
            if (blobId === gcBlobId) {
                return gcState;
            }
            return {};
        };
        const garbageCollector = createGarbageCollector(baseSnapshot, getNodeGCDetails);

        // Remove node 3's reference from node 2 so that it is still unreferenced. The GC details from the base summary
        // are not loaded until the first time GC is run, so run GC.
        defaultGCData.gcNodes[nodes[2]] = [];
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
        defaultGCData.gcNodes[nodes[2]] = [ nodes[3] ];
        await garbageCollector.collectGarbage({ runGC: true });
        assert(
            mockLogger.matchEvents([
                { eventName: inactiveObjectRevivedEvent, deleteTimeoutMs, inactiveNodeId: nodes[3] },
            ]),
            "inactiveObjectRevived event not generated as expected",
        );
    });

    it("generates inactive events for nodes that are inactive on load - snapshot is in old format", async () => {
        // Create GC details for node 3's GC blob whose unreferenced time was > deleteTimeoutMs ago.
        // This means this node should become inactive as soon as its data is loaded.
        const node3GCDetails: IGarbageCollectionSummaryDetails = {
            gcData: { gcNodes: { "/": [] } },
            unrefTimestamp: Date.now() - (deleteTimeoutMs + 100),
        };
        const node3Snapshot = getDummySnapshotTree();
        node3Snapshot.blobs[gcBlobKey] = "node3GCDetails";

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
        defaultGCData.gcNodes[nodes[2]] = [];
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
        defaultGCData.gcNodes[nodes[2]] = [ nodes[3] ];
        await garbageCollector.collectGarbage({ runGC: true });
        assert(
            mockLogger.matchEvents([
                { eventName: inactiveObjectRevivedEvent, deleteTimeoutMs, inactiveNodeId: nodes[3] },
            ]),
            "inactiveObjectRevived event not generated as expected",
        );
    });

    it(`generates inactive events for nodes that are inactive on load - GC state is present in multiple` +
        `blobs in base snapshot`, async () => {
        const gcBlobMap: Map<string, IGarbageCollectionState> = new Map();
        const expiredTimestampMs = Date.now() - (deleteTimeoutMs + 100);

        // Create three GC states to be added into separate GC blobs. Each GC state has a node whose unreferenced
        // time was > deletedTimeoutMs ago. These three GC blobs are the added to the GC tree in summary.
        const blob1Id = "blob1";
        const blob1GCState: IGarbageCollectionState = { gcNodes: {} };
        blob1GCState.gcNodes[nodes[1]] = { outboundRoutes: [], unreferencedTimestampMs: expiredTimestampMs };
        gcBlobMap.set(blob1Id, blob1GCState);

        const blob2Id = "blob2";
        const blob2GCState: IGarbageCollectionState = { gcNodes: {} };
        blob2GCState.gcNodes[nodes[2]] = { outboundRoutes: [], unreferencedTimestampMs: expiredTimestampMs };
        gcBlobMap.set(blob2Id, blob2GCState);

        const blob3Id = "blob3";
        const blob3GCState: IGarbageCollectionState = { gcNodes: {} };
        blob3GCState.gcNodes[nodes[3]] = { outboundRoutes: [], unreferencedTimestampMs: expiredTimestampMs };
        gcBlobMap.set(blob3Id, blob3GCState);

        // Create a GC snapshot tree and add the above three GC blob ids to it.
        const gcSnapshotTree = getDummySnapshotTree();
        gcSnapshotTree.blobs[`${gcBlobPrefix}_${blob1Id}`] = blob1Id;
        gcSnapshotTree.blobs[`${gcBlobPrefix}_${blob2Id}`] = blob2Id;
        gcSnapshotTree.blobs[`${gcBlobPrefix}_${blob3Id}`] = blob3Id;

        // Create a base snapshot that contains the above GC snapshot tree.
        const baseSnapshot = getDummySnapshotTree();
        baseSnapshot.trees[gcTreeKey] = gcSnapshotTree;

        const getNodeGCDetails = (blobId: string) => {
            return gcBlobMap.get(blobId) ?? {};
        };
        const garbageCollector = createGarbageCollector(baseSnapshot, getNodeGCDetails);

        // For the nodes in the GC snapshot blobs, remove their references from the default GC data.
        defaultGCData.gcNodes[nodes[0]] = [];
        defaultGCData.gcNodes[nodes[1]] = [];
        defaultGCData.gcNodes[nodes[2]] = [];

        await garbageCollector.collectGarbage({ runGC: true });

        // Change the nodes and validate that an inactiveObjectChanged event is generated for each.
        garbageCollector.nodeChanged(nodes[1]);
        garbageCollector.nodeChanged(nodes[2]);
        garbageCollector.nodeChanged(nodes[3]);
        assert(
            mockLogger.matchEvents([
                { eventName: inactiveObjectChangedEvent, deleteTimeoutMs, inactiveNodeId: nodes[1] },
                { eventName: inactiveObjectChangedEvent, deleteTimeoutMs, inactiveNodeId: nodes[2] },
                { eventName: inactiveObjectChangedEvent, deleteTimeoutMs, inactiveNodeId: nodes[3] },
            ]),
            "inactiveObjectChanged event not generated as expected",
        );
    });
});
