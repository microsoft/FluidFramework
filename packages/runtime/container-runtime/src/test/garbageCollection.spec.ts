/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { concatGarbageCollectionStates } from "@fluidframework/garbage-collector";
import { ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
    gcBlobKey,
    IGarbageCollectionData,
    IGarbageCollectionNodeData,
    IGarbageCollectionState,
    IGarbageCollectionDetailsBase,
    ISummarizeResult,
} from "@fluidframework/runtime-definitions";
import { MockLogger, sessionStorageConfigProvider, TelemetryDataTag, mixinMonitoringContext } from "@fluidframework/telemetry-utils";
import { ReadAndParseBlob } from "@fluidframework/runtime-utils";
import {
    defaultSessionExpiryDurationMs,
    GarbageCollector,
    gcBlobPrefix,
    GCNodeType,
    gcTreeKey,
    IGarbageCollectionRuntime,
    IGarbageCollector,
    runSessionExpiryKey,
    disableSessionExpiryKey,
} from "../garbageCollection";
import { IContainerRuntimeMetadata } from "../summaryFormat";

describe("Garbage Collection Tests", () => {
    // Nodes in the reference graph.
    const nodes: string[] = [
        "/node1",
        "/node2",
        "/node3",
        "/node4",
    ];

    let clock: SinonFakeTimers;
    const mockLogger: MockLogger = new MockLogger();
    const mc = mixinMonitoringContext(mockLogger, sessionStorageConfigProvider.value);
    let closeCalled = false;
    // Time after which unreferenced nodes becomes inactive.
    const inactiveTimeoutMs = 500;
    const testPkgPath = ["testPkg"];
    // The package data is tagged in the telemetry event.
    const eventPkg = { value: testPkgPath.join("/"), tag: TelemetryDataTag.PackageData };

    const getNodeType = (nodePath: string) => {
        if (nodePath.split("/").length !== 2) {
            return GCNodeType.Other;
        }
        return GCNodeType.DataStore;
    };
    // The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
    const defaultGCData: IGarbageCollectionData = { gcNodes: {} };
    // The runtime to be passed to the garbage collector.
    const gcRuntime: IGarbageCollectionRuntime = {
        updateStateBeforeGC: async () => {},
        getGCData: async (fullGC?: boolean) => defaultGCData,
        updateUsedRoutes: (usedRoutes: string[]) => { return { totalNodeCount: 0, unusedNodeCount: 0 }; },
        deleteUnusedRoutes: (unusedRoutes: string[]) => {},
        getNodeType,
        getCurrentReferenceTimestampMs: () => Date.now(),
        closeFn: () => { closeCalled = true; },
    };

    // The GC details in the summary blob of a node. This is used by the garbage collector to initialize GC state.
    // Update this for individual node to update the initial GC state of that node.
    const emptyGCDetails: IGarbageCollectionDetailsBase = {};

    const createGarbageCollector = (
        baseSnapshot: ISnapshotTree | undefined = undefined,
        getNodeGCDetails: (id: string) => IGarbageCollectionDetailsBase = () => emptyGCDetails,
        metadata: IContainerRuntimeMetadata | undefined = undefined,
    ) => {
        return GarbageCollector.create({
            runtime: gcRuntime,
            gcOptions: { gcAllowed: true, inactiveTimeoutMs },
            baseSnapshot,
            baseLogger: mockLogger,
            existing: metadata !== undefined /* existing */,
            metadata,
            isSummarizerClient: true /* summarizerClient */,
            readAndParseBlob: async <T>(id: string) => getNodeGCDetails(id) as T,
            getNodePackagePath: (nodeId: string) => testPkgPath,
            getLastSummaryTimestampMs: () => Date.now(),
        });
    };

    const oldRawConfig = sessionStorageConfigProvider.value.getRawConfig;
    let injectedSettings = {};

    before(() => {
        clock = useFakeTimers();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        sessionStorageConfigProvider.value.getRawConfig = (name) => injectedSettings[name];
    });

    afterEach(() => {
        clock.reset();
        mockLogger.clear();
        injectedSettings = {};
    });

    after(() => {
        clock.restore();
        sessionStorageConfigProvider.value.getRawConfig = oldRawConfig;
    });

    describe("Session expiry", () => {
        const testOverrideSessionExpiryMsKey = "Fluid.GarbageCollection.TestOverride.SessionExpiryMs";

        beforeEach(() => {
            closeCalled = false;
            injectedSettings[runSessionExpiryKey] = "true";
        });

        function closeCalledAfterExactTicks(ticks: number) {
            clock.tick(ticks - 1);
            if (closeCalled) {
                return false;
            }
            clock.tick(1);
            return closeCalled;
        }

        it("Session expires for an existing container", async () => {
            const metadata: IContainerRuntimeMetadata =
                { summaryFormatVersion: 1, message: undefined, sessionExpiryTimeoutMs: 10 };
            createGarbageCollector(undefined, undefined, metadata);
            assert(closeCalledAfterExactTicks(10), "Close should have been called at exact expiry.");
        });

        it("Session expires for a new container", async () => {
            createGarbageCollector();
            assert(closeCalledAfterExactTicks(defaultSessionExpiryDurationMs), "Close should have been called at exact expiry.");
        });

        it("Session expiry disabled via DisableSessionExpiry config", async () => {
            // disable expiry even though it's set to run (meaning expiry value will present)
            injectedSettings[disableSessionExpiryKey] = "true";
            createGarbageCollector();
            assert(!closeCalledAfterExactTicks(defaultSessionExpiryDurationMs), "Close should NOT have been called due to disable.");
        });

        it("Session expiry explicitly not disabled via DisableSessionExpiry config", async () => {
            // Explicitly set value to false (instead of relying on undefined)
            injectedSettings[disableSessionExpiryKey] = "false";
            createGarbageCollector();
            assert(closeCalledAfterExactTicks(defaultSessionExpiryDurationMs), "Close should have been called at exact expiry.");
        });

        it("Session expiry overridden via TestOverride setting (existing container)", async () => {
            // Override expiry to 2 seconds
            injectedSettings[testOverrideSessionExpiryMsKey] = "2000";
            const customExpiryMs = mc.config.getNumber(testOverrideSessionExpiryMsKey);
            assert(customExpiryMs, "setting not found!");

            const metadata: IContainerRuntimeMetadata =
                { summaryFormatVersion: 1, message: undefined, sessionExpiryTimeoutMs: 10 };
            createGarbageCollector(undefined, undefined, metadata);
            assert(closeCalledAfterExactTicks(customExpiryMs), "Close should have been called at exact expiry.");
        });

        it("Session expiry overridden via TestOverride setting (new container)", async () => {
            // Override expiry to 2 seconds
            injectedSettings[testOverrideSessionExpiryMsKey] = "2000";
            const customExpiryMs = mc.config.getNumber(testOverrideSessionExpiryMsKey);
            assert(customExpiryMs, "setting not found!");

            createGarbageCollector();
            assert(closeCalledAfterExactTicks(customExpiryMs), "Close should have been called at exact expiry.");
        });

        it("Session expiry override ignored if RunSessionExpiry setting disabled", async () => {
            injectedSettings[runSessionExpiryKey] = "false";
            injectedSettings[testOverrideSessionExpiryMsKey] = "2000";
            const customExpiryMs = mc.config.getNumber(testOverrideSessionExpiryMsKey);
            assert(customExpiryMs, "setting not found!");

            createGarbageCollector();

            clock.tick(customExpiryMs);
            assert(!closeCalled, "Close should not have been called since runSessionExpiry disabled.");
            clock.tick(defaultSessionExpiryDurationMs);
            assert(!closeCalled, "Close should not have been called since runSessionExpiry disabled.");
        });

        it("Session expiry override ignored if DisableSessionExpiry is true", async () => {
            injectedSettings[disableSessionExpiryKey] = "true";
            injectedSettings[testOverrideSessionExpiryMsKey] = "2000";
            const customExpiryMs = mc.config.getNumber(testOverrideSessionExpiryMsKey);
            assert(customExpiryMs, "setting not found!");

            createGarbageCollector();

            clock.tick(customExpiryMs);
            assert(!closeCalled, "Close should not have been called since DisableSessionExpiry true.");
            clock.tick(defaultSessionExpiryDurationMs);
            assert(!closeCalled, "Close should not have been called since DisableSessionExpiry true.");
        });
    });

    describe("Inactive events", () => {
        const revivedEvent = "GarbageCollector:inactiveObject_Revived";
        const changedEvent = "GarbageCollector:inactiveObject_Changed";
        const loadedEvent = "GarbageCollector:inactiveObject_Loaded";

        // Validates that no inactive event has been fired.
        function validateNoInactiveEvents() {
            assert(
                !mockLogger.matchAnyEvent([
                    { eventName: revivedEvent },
                    { eventName: changedEvent },
                    { eventName: loadedEvent },
                ]),
                "inactive object events should not have been logged",
            );
        }

        // Simulates node loaded and changed activity for all the nodes in the graph.
        function updateAllNodes(garbageCollector: IGarbageCollector) {
            nodes.forEach((nodeId) => {
                garbageCollector.nodeUpdated(nodeId, "Changed", Date.now(), testPkgPath);
                garbageCollector.nodeUpdated(nodeId, "Loaded", Date.now(), testPkgPath);
            });
        }

        // Returns a dummy snapshot tree to be built upon.
        const getDummySnapshotTree = (): ISnapshotTree => {
            return {
                blobs: {},
                trees: {},
            };
        };

        beforeEach(async () => {
            // Set up the reference graph such that all nodes are referenced. Add in a couple of cycles in the graph.
            defaultGCData.gcNodes["/"] = [nodes[0]];
            defaultGCData.gcNodes[nodes[0]] = [nodes[1]];
            defaultGCData.gcNodes[nodes[1]] = [nodes[0], nodes[2]];
            defaultGCData.gcNodes[nodes[2]] = [nodes[3]];
            defaultGCData.gcNodes[nodes[3]] = [nodes[0]];
        });

        it("doesn't generate events for referenced nodes", async () => {
            const garbageCollector = createGarbageCollector();

            // Run garbage collection on the default GC data where everything is referenced.
            await garbageCollector.collectGarbage({ runGC: true });

            // Update all nodes.
            updateAllNodes(garbageCollector);

            // Validate that no inactive events are generated yet.
            validateNoInactiveEvents();

            // Expire the unreferenced timer (if any).
            clock.tick(inactiveTimeoutMs + 1);

            // Change all nodes again.
            updateAllNodes(garbageCollector);

            // Validate that no inactive events are generated since everything is referenced.
            validateNoInactiveEvents();
        });

        it("generates events when inactive node is changed or revived", async () => {
            const garbageCollector = createGarbageCollector();

            // Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
            defaultGCData.gcNodes[nodes[1]] = [];

            await garbageCollector.collectGarbage({ runGC: true });

            // Update all nodes.
            updateAllNodes(garbageCollector);

            // Validate that no inactive events are generated yet.
            validateNoInactiveEvents();

            // Expire the unreferenced timer (if any).
            clock.tick(inactiveTimeoutMs + 1);

            // Update all nodes. This should result in an inactiveObjectChanged event for node 2 and node 3 since they
            // are inactive.
            updateAllNodes(garbageCollector);
            assert(
                mockLogger.matchEvents([
                    { eventName: changedEvent, timeout: inactiveTimeoutMs, id: nodes[2], pkg: eventPkg },
                    { eventName: loadedEvent, timeout: inactiveTimeoutMs, id: nodes[2], pkg: eventPkg },
                    { eventName: changedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                    { eventName: loadedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactive events not generated as expected",
            );

            // Add reference from node 1 to node 3 and validate that we get revivedEvent event.
            garbageCollector.addedOutboundReference(nodes[1], nodes[3]);
            assert(
                mockLogger.matchEvents([
                    { eventName: revivedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactive event not generated as expected",
            );
        });

        it("generates events once per node", async () => {
            const garbageCollector = createGarbageCollector();

            // Remove node 3's reference from node 2.
            defaultGCData.gcNodes[nodes[2]] = [];

            await garbageCollector.collectGarbage({ runGC: true });

            // Expire the unreferenced timer (if any).
            clock.tick(inactiveTimeoutMs + 1);

            // Update all nodes. This should result in an inactiveObjectChanged event for node 3 since it's inactive.
            updateAllNodes(garbageCollector);
            assert(
                mockLogger.matchEvents([
                    { eventName: changedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                    { eventName: loadedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactive events not generated as expected",
            );

            // Update all nodes. There shouldn't be any more inactive events since for each node the event is only
            // once.
            updateAllNodes(garbageCollector);
            validateNoInactiveEvents();
        });

        /**
         * Here, the base snapshot contains nodes that are inactive. The test validates that we generate inactive events
         * for these nodes.
         */
        it("generates events for nodes that are inactive on load", async () => {
            // Create GC state where node 3's unreferenced time was > inactiveTimeoutMs ago.
            // This means this node should become inactive as soon as its data is loaded.

            // Create a snapshot tree to be used as the GC snapshot tree.
            const gcSnapshotTree = getDummySnapshotTree();
            const gcBlobId = "root";
            // Add a GC blob with key that start with `gcBlobPrefix` to the GC snapshot tree. The blob Id for this
            // is generated by server in real scenarios but we use a static id here for testing.
            gcSnapshotTree.blobs[`${gcBlobPrefix}_${gcBlobId}`] = gcBlobId;

            // Create a base snapshot that contains the GC snapshot tree.
            const baseSnapshot = getDummySnapshotTree();
            baseSnapshot.trees[gcTreeKey] = gcSnapshotTree;

            // Create GC state with node 3 expired. This will be returned when the garbage collector asks
            // for the GC blob with `gcBlobId`.
            const gcState: IGarbageCollectionState = { gcNodes: {} };
            const node3Data: IGarbageCollectionNodeData = {
                outboundRoutes: [],
                unreferencedTimestampMs: Date.now() - (inactiveTimeoutMs + 100),
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

            // Remove node 3's reference from node 2 so that it is still unreferenced. The GC details from the base
            // summary is not loaded until the first time GC is run, so run GC.
            defaultGCData.gcNodes[nodes[2]] = [];
            await garbageCollector.collectGarbage({ runGC: true });

            // Update node 3. This should result in an inactiveObjectChanged/Loaded event since it should be inactive.
            garbageCollector.nodeUpdated(nodes[3], "Changed", Date.now(), testPkgPath);
            garbageCollector.nodeUpdated(nodes[3], "Loaded", Date.now(), testPkgPath);
            assert(
                mockLogger.matchEvents([
                    { eventName: changedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                    { eventName: loadedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactive events not generated as expected",
            );

            // Add reference from node 2 to node 3 and validate that we get revivedEvent event.
            garbageCollector.addedOutboundReference(nodes[2], nodes[3]);
            assert(
                mockLogger.matchEvents([
                    { eventName: revivedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactive event not generated as expected",
            );
        });

        /**
         * Here, the base snapshot contains nodes that are inactive and the GC blob in snapshot is in old format. The
         * test validates that we generate inactive events for these nodes.
         */
        it("generates events for nodes that are inactive on load - old snapshot format", async () => {
            // Create GC details for node 3's GC blob whose unreferenced time was > inactiveTimeoutMs ago.
            // This means this node should become inactive as soon as its data is loaded.
            const node3GCDetails: IGarbageCollectionDetailsBase = {
                gcData: { gcNodes: { "/": [] } },
                unrefTimestamp: Date.now() - (inactiveTimeoutMs + 100),
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

            // Remove node 3's reference from node 2 so that it is still unreferenced. The GC details from the base
            // summary is not loaded until the first time GC is run, so do that immediately.
            defaultGCData.gcNodes[nodes[2]] = [];
            await garbageCollector.collectGarbage({ runGC: true });

            // Change node 3. This should result in an inactiveObjectChanged/Loaded event since it should be inactive.
            garbageCollector.nodeUpdated(nodes[3], "Changed", Date.now(), testPkgPath);
            garbageCollector.nodeUpdated(nodes[3], "Loaded", Date.now(), testPkgPath);
            assert(
                mockLogger.matchEvents([
                    { eventName: changedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                    { eventName: loadedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactive event not generated as expected",
            );

            // Add reference from node 2 to node 3 and validate that we get revivedEvent event.
            garbageCollector.addedOutboundReference(nodes[2], nodes[3]);
            assert(
                mockLogger.matchEvents([
                    { eventName: revivedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactive event not generated as expected",
            );
        });

        /**
         * Here, the base snapshot contains nodes that are inactive and the GC data in snapshot is present in multiple
         * blobs. The test validates that we generate inactive events for these nodes.
         */
        it(`generates events for nodes that are inactive on load - multi blob GC data`, async () => {
            const gcBlobMap: Map<string, IGarbageCollectionState> = new Map();
            const expiredTimestampMs = Date.now() - (inactiveTimeoutMs + 100);

            // Create three GC states to be added into separate GC blobs. Each GC state has a node whose unreferenced
            // time was > inactiveTimeoutMs ago. These three GC blobs are the added to the GC tree in summary.
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

            // Update the nodes and validate that inactive events is correctly generated for each.
            garbageCollector.nodeUpdated(nodes[1], "Changed", Date.now(), testPkgPath);
            garbageCollector.nodeUpdated(nodes[2], "Changed", Date.now(), testPkgPath);
            garbageCollector.nodeUpdated(nodes[3], "Loaded", Date.now(), testPkgPath);
            assert(
                mockLogger.matchEvents([
                    { eventName: changedEvent, timeout: inactiveTimeoutMs, id: nodes[1], pkg: eventPkg },
                    { eventName: changedEvent, timeout: inactiveTimeoutMs, id: nodes[2], pkg: eventPkg },
                    { eventName: loadedEvent, timeout: inactiveTimeoutMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactiveObjectChanged event not generated as expected",
            );
        });

        it("can override inactive timeout via feature flags", async () => {
            const inactiveTimeoutOverrideMs = 100;
            const testOverrideInactiveTimeoutMsKey = "Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs";
            injectedSettings[testOverrideInactiveTimeoutMsKey] = inactiveTimeoutOverrideMs;
            const garbageCollector = createGarbageCollector();

            // Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
            defaultGCData.gcNodes[nodes[1]] = [];

            await garbageCollector.collectGarbage({ runGC: true });

            // Update all nodes.
            updateAllNodes(garbageCollector);

            // Validate that no inactive events are generated yet.
            validateNoInactiveEvents();

            // Advance the clock so that inactive timeout expires.
            clock.tick(inactiveTimeoutOverrideMs + 1);

            // Update all nodes. This should result in an inactiveObjectChanged event for node 2 and node 3 since they
            // are inactive.
            updateAllNodes(garbageCollector);
            assert(
                mockLogger.matchEvents([
                    { eventName: changedEvent, timeout: inactiveTimeoutOverrideMs, id: nodes[2], pkg: eventPkg },
                    { eventName: loadedEvent, timeout: inactiveTimeoutOverrideMs, id: nodes[2], pkg: eventPkg },
                    { eventName: changedEvent, timeout: inactiveTimeoutOverrideMs, id: nodes[3], pkg: eventPkg },
                    { eventName: loadedEvent, timeout: inactiveTimeoutOverrideMs, id: nodes[3], pkg: eventPkg },
                ]),
                "inactive events not generated as expected",
            );
        });
    });

    describe("GC completed runs", () => {
        const gcEndEvent = "GarbageCollector:GarbageCollection_end";

        it("increments GC completed runs in logged events correctly", async () => {
            const garbageCollector = createGarbageCollector();

            await garbageCollector.collectGarbage({});
            assert(
                mockLogger.matchEvents([{ eventName: gcEndEvent, completedGCRuns: 0 }]),
                "completedGCRuns should be 0 since this event was logged before first GC run completed",
            );

            await garbageCollector.collectGarbage({});
            assert(
                mockLogger.matchEvents([{ eventName: gcEndEvent, completedGCRuns: 1 }]),
                "completedGCRuns should be 1 since this event was logged after first GC run completed",
            );

            await garbageCollector.collectGarbage({});
            assert(
                mockLogger.matchEvents([{ eventName: gcEndEvent, completedGCRuns: 2 }]),
                "completedGCRuns should be 2 since this event was logged after second GC run completed",
            );

            // The GC run count should reset for new garbage collector.
            const garbageCollector2 = createGarbageCollector();
            await garbageCollector2.collectGarbage({});
            assert(
                mockLogger.matchEvents([{ eventName: gcEndEvent, completedGCRuns: 0 }]),
                "completedGCRuns should be 0 since this event was logged before first GC run in new garbage collector",
            );
        });
    });

    /**
     * These tests validate such scenarios where nodes transition from unreferenced -\> referenced -\> unreferenced
     * state by verifying that their unreferenced timestamps are updated correctly.
     *
     * In these tests, V = nodes and E = edges between nodes. Root nodes that are always referenced are marked as *.
     */
    describe("References between summaries", () => {
        let garbageCollector: IGarbageCollector;
        const nodeA = "/A";
        const nodeB = "/B";
        const nodeC = "/C";
        const nodeD = "/D";
        const nodeE = "/A/E";

        // Runs GC and returns the unreferenced timestamps of all nodes in the GC summary.
        async function getUnreferencedTimestamps() {
            // Advance the clock by 1 tick so that the unreferenced timestamp is updated in between runs.
            clock.tick(1);

            await garbageCollector.collectGarbage({ runGC: true });

            const summaryTree = garbageCollector.summarize(true, false)?.summary;
            assert(summaryTree !== undefined, "Nothing to summarize after running GC");
            assert(summaryTree.type === SummaryType.Tree, "Expecting a summary tree!");

            let rootGCState: IGarbageCollectionState = { gcNodes: {} };
            for (const key of Object.keys(summaryTree.tree)) {
                // Skip blobs that do not start with the GC prefix.
                if (!key.startsWith(gcBlobPrefix)) {
                    continue;
                }

                const gcBlob = summaryTree.tree[key];
                assert(gcBlob?.type === SummaryType.Blob, `GC blob not available`);
                const gcState = JSON.parse(gcBlob.content as string) as IGarbageCollectionState;
                // Merge the GC state of this blob into the root GC state.
                rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
            }
            const nodeTimestamps: Map<string, number | undefined> = new Map();
            for (const [nodeId, nodeData] of Object.entries(rootGCState.gcNodes)) {
                nodeTimestamps.set(nodeId, nodeData.unreferencedTimestampMs);
            }
            return nodeTimestamps;
        }

        beforeEach(() => {
            closeCalled = false;
            defaultGCData.gcNodes = {};
            garbageCollector = createGarbageCollector();
        });

        /**
         * Validates that we can detect references that were added and then removed.
         * 1. Summary 1 at t1. V = [A*, B]. E = []. B has unreferenced time t1.
         * 2. Reference from A to B added. E = [A -\> B].
         * 3. Reference from A to B removed. E = [].
         * 4. Summary 2 at t2. V = [A*, B]. E = []. B has unreferenced time t2.
         * Validates that the unreferenced time for B is t2 which is \> t1.
         */
        it(`Scenario 1 - Reference added and then removed`, async () => {
            // Initialize nodes A and B.
            defaultGCData.gcNodes["/"] = [nodeA];
            defaultGCData.gcNodes[nodeA] = [];
            defaultGCData.gcNodes[nodeB] = [];

            // 1. Run GC and generate summary 1. E = [].
            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime1 = timestamps1.get(nodeB);
            assert(nodeBTime1 !== undefined, "B should have unreferenced timestamp");

            // 2. Add reference from A to B. E = [A -\> B].
            garbageCollector.addedOutboundReference(nodeA, nodeB);
            defaultGCData.gcNodes[nodeA] = [nodeB];

            // 3. Remove reference from A to B. E = [].
            defaultGCData.gcNodes[nodeA] = [];

            // 4. Run GC and generate summary 2. E = [].
            const timestamps2 = await getUnreferencedTimestamps();
            assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime2 = timestamps2.get(nodeB);

            assert(nodeBTime2 !== undefined && nodeBTime2 > nodeBTime1, "B's timestamp should have updated");
        });

        /**
         * Validates that we can detect references that were added transitively and then removed.
         * 1. Summary 1 at t1. V = [A*, B, C]. E = [B -\> C]. B and C have unreferenced time t2.
         * 2. Reference from A to B added. E = [A -\> B, B -\> C].
         * 3. Reference from B to C removed. E = [A -\> B].
         * 4. Reference from A to B removed. E = [].
         * 5. Summary 2 at t2. V = [A*, B, C]. E = []. B and C have unreferenced time t2.
         * Validates that the unreferenced time for B and C is t2 which is \> t1.
         */
        it(`Scenario 2 - Reference transitively added and removed`, async () => {
            // Initialize nodes A, B and C.
            defaultGCData.gcNodes["/"] = [nodeA];
            defaultGCData.gcNodes[nodeA] = [];
            defaultGCData.gcNodes[nodeB] = [nodeC];
            defaultGCData.gcNodes[nodeC] = [];

            // 1. Run GC and generate summary 1. E = [B -\> C].
            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime1 = timestamps1.get(nodeB);
            const nodeCTime1 = timestamps1.get(nodeC);
            assert(nodeBTime1 !== undefined, "B should have unreferenced timestamp");
            assert(nodeCTime1 !== undefined, "C should have unreferenced timestamp");

            // 2. Add reference from A to B. E = [A -\> B, B -\> C].
            garbageCollector.addedOutboundReference(nodeA, nodeB);
            defaultGCData.gcNodes[nodeA] = [nodeB];

            // 3. Remove reference from B to C. E = [A -\> B].
            defaultGCData.gcNodes[nodeB] = [];

            // 4. Remove reference from A to B. E = [].
            defaultGCData.gcNodes[nodeA] = [];

            // 5. Run GC and generate summary 2. E = [].
            const timestamps2 = await getUnreferencedTimestamps();
            assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime2 = timestamps2.get(nodeB);
            const nodeCTime2 = timestamps2.get(nodeC);
            assert(nodeBTime2 !== undefined && nodeBTime2 > nodeBTime1, "B's timestamp should have updated");
            assert(nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1, "C's timestamp should have updated");
        });

        /**
         * Validates that we can detect chain of references in which the first reference was added and then removed.
         * 1. Summary 1 at t1. V = [A*, B, C, D]. E = [B -\> C, C -\> D]. B, C and D have unreferenced time t2.
         * 2. Reference from A to B added. E = [A -\> B, B -\> C, C -\> D].
         * 3. Reference from A to B removed. E = [B -\> C, C -\> D].
         * 4. Summary 2 at t2. V = [A*, B, C, D]. E = [B -\> C, C -\> D]. B, C and D have unreferenced time t2.
         * Validates that the unreferenced time for B, C and D is t2 which is \> t1.
         */
        it(`Scenario 3 - Reference added through chain of references and removed`, async () => {
            // Initialize nodes A, B, C and D.
            defaultGCData.gcNodes["/"] = [nodeA];
            defaultGCData.gcNodes[nodeA] = [];
            defaultGCData.gcNodes[nodeB] = [nodeC];
            defaultGCData.gcNodes[nodeC] = [nodeD];
            defaultGCData.gcNodes[nodeD] = [];

            // 1. Run GC and generate summary 1. E = [B -\> C, C -\> D].
            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime1 = timestamps1.get(nodeB);
            const nodeCTime1 = timestamps1.get(nodeC);
            const nodeDTime1 = timestamps1.get(nodeD);
            assert(nodeBTime1 !== undefined, "B should have unreferenced timestamp");
            assert(nodeCTime1 !== undefined, "C should have unreferenced timestamp");
            assert(nodeDTime1 !== undefined, "D should have unreferenced timestamp");

            // 2. Add reference from A to B. E = [A -\> B, B -\> C, C -\> D].
            garbageCollector.addedOutboundReference(nodeA, nodeB);
            defaultGCData.gcNodes[nodeA] = [nodeB];

            // 3. Remove reference from A to B. E = [B -\> C, C -\> D].
            defaultGCData.gcNodes[nodeA] = [];

            // 4. Run GC and generate summary 2. E = [B -\> C, C -\> D].
            const timestamps2 = await getUnreferencedTimestamps();
            assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime2 = timestamps2.get(nodeB);
            const nodeCTime2 = timestamps2.get(nodeC);
            const nodeDTime2 = timestamps2.get(nodeD);
            assert(nodeBTime2 !== undefined && nodeBTime2 > nodeBTime1, "B's timestamp should have updated");
            assert(nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1, "C's timestamp should have updated");
            assert(nodeDTime2 !== undefined && nodeDTime2 > nodeDTime1, "D's timestamp should have updated");
        });

        /**
         * Validates that we can detect references that were added and removed via new nodes.
         * 1. Summary 1 at t1. V = [A*, C]. E = []. C has unreferenced time t1.
         * 2. Node B is created. E = [].
         * 3. Reference from A to B added. E = [A -\> B].
         * 4. Reference from B to C added. E = [A -\> B, B -\> C].
         * 5. Reference from B to C removed. E = [A -\> B].
         * 6. Summary 2 at t2. V = [A*, B, C]. E = [A -\> B]. C has unreferenced time t2.
         * Validates that the unreferenced time for C is t2 which is \> t1.
         */
        it(`Scenario 4 - Reference added via new nodes and removed`, async () => {
            // Initialize nodes A, B and C.
            defaultGCData.gcNodes["/"] = [nodeA];
            defaultGCData.gcNodes[nodeA] = [];
            defaultGCData.gcNodes[nodeC] = [];

            // 1. Run GC and generate summary 1. E = [].
            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(nodeA) === undefined, "A should be referenced");

            const nodeCTime1 = timestamps1.get(nodeC);
            assert(nodeCTime1 !== undefined, "C should have unreferenced timestamp");

            // 2. Create node B, i.e., add B to GC data. E = [].
            defaultGCData.gcNodes[nodeB] = [];

            // 3. Add reference from A to B. E = [A -\> B].
            garbageCollector.addedOutboundReference(nodeA, nodeB);
            defaultGCData.gcNodes[nodeA] = [nodeB];

            // 4. Add reference from B to C. E = [A -\> B, B -\> C].
            garbageCollector.addedOutboundReference(nodeB, nodeC);
            defaultGCData.gcNodes[nodeB] = [nodeC];

            // 5. Remove reference from B to C. E = [A -\> B].
            defaultGCData.gcNodes[nodeB] = [];

            // 6. Run GC and generate summary 2. E = [A -\> B].
            const timestamps2 = await getUnreferencedTimestamps();
            assert(timestamps2.get(nodeA) === undefined, "A should be referenced");
            assert(timestamps2.get(nodeB) === undefined, "B should be referenced");

            const nodeCTime2 = timestamps2.get(nodeC);
            assert(nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1, "C's timestamp should have updated");
        });

        /**
         * Validates that references added by unreferences nodes do not show up as references.
         * 1. Summary 1 at t1. V = [A*, B, C]. E = []. B and C have unreferenced time t1.
         * 2. Reference from B to C. E = [B -\> C].
         * 3. Summary 2 at t2. V = [A*, B, C]. E = [B -\> C]. B and C have unreferenced time t1.
         * Validates that the unreferenced time for B and C is still t1.
         */
        it(`Scenario 5 - Reference added via unreferenced nodes`, async () => {
            // Initialize nodes A, B and C.
            defaultGCData.gcNodes["/"] = [nodeA];
            defaultGCData.gcNodes[nodeA] = [];
            defaultGCData.gcNodes[nodeB] = [];
            defaultGCData.gcNodes[nodeC] = [];

            // 1. Run GC and generate summary 1. E = [B -\> C].
            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime1 = timestamps1.get(nodeB);
            const nodeCTime1 = timestamps1.get(nodeC);
            assert(nodeBTime1 !== undefined, "B should have unreferenced timestamp");
            assert(nodeCTime1 !== undefined, "C should have unreferenced timestamp");

            // 2. Add reference from B to C. E = [B -\> C].
            garbageCollector.addedOutboundReference(nodeB, nodeC);
            defaultGCData.gcNodes[nodeB] = [nodeC];

            // 3. Run GC and generate summary 2. E = [B -\> C].
            const timestamps2 = await getUnreferencedTimestamps();
            assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime2 = timestamps2.get(nodeB);
            const nodeCTime2 = timestamps2.get(nodeC);
            assert(nodeBTime2 === nodeBTime1, "B's timestamp should be unchanged");
            assert(nodeCTime2 === nodeCTime1, "C's timestamp should be unchanged");
        });

        /**
         * Validates that we can detect multiple references that were added and then removed by the same node.
         * 1. Summary 1 at t1. V = [A*, B, C]. E = []. B and C have unreferenced time t1.
         * 2. Reference from A to B added. E = [A -\> B].
         * 3. Reference from A to C added. E = [A -\> B, A -\> C].
         * 4. Reference from A to B removed. E = [A -\> C].
         * 5. Reference from A to C removed. E = [].
         * 6. Summary 2 at t2. V = [A*, B]. E = []. B and C have unreferenced time t2.
         * Validates that the unreferenced time for B and C is t2 which is \> t1.
         */
        it(`Scenario 6 - Multiple references added and then removed by same node`, async () => {
            // Initialize nodes A, B and C.
            defaultGCData.gcNodes["/"] = [nodeA];
            defaultGCData.gcNodes[nodeA] = [];
            defaultGCData.gcNodes[nodeB] = [];
            defaultGCData.gcNodes[nodeC] = [];

            // 1. Run GC and generate summary 1. E = [].
            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime1 = timestamps1.get(nodeB);
            const nodeCTime1 = timestamps1.get(nodeC);
            assert(nodeBTime1 !== undefined, "B should have unreferenced timestamp");
            assert(nodeCTime1 !== undefined, "C should have unreferenced timestamp");

            // 2. Add reference from A to B. E = [A -\> B].
            garbageCollector.addedOutboundReference(nodeA, nodeB);
            defaultGCData.gcNodes[nodeA] = [nodeB];

            // 3. Add reference from A to C. E = [A -\> B, A -\> C].
            garbageCollector.addedOutboundReference(nodeA, nodeC);
            defaultGCData.gcNodes[nodeA] = [nodeB, nodeC];

            // 4. Remove reference from A to B. E = [A -\> C].
            defaultGCData.gcNodes[nodeA] = [nodeC];

            // 5. Remove reference from A to C. E = [].
            defaultGCData.gcNodes[nodeA] = [];

            // 6. Run GC and generate summary 2. E = [].
            const timestamps2 = await getUnreferencedTimestamps();
            assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

            const nodeBTime2 = timestamps2.get(nodeB);
            const nodeCTime2 = timestamps2.get(nodeC);
            assert(nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1, "C's timestamp should have updated");
            assert(nodeBTime2 !== undefined && nodeBTime2 > nodeBTime1, "B's timestamp should have updated");
        });

        /**
         * Validates that we generate error on detecting reference during GC that was not notified explicitly.
         * 1. Summary 1 at t1. V = [A*]. E = [].
         * 2. Node B is created. E = [].
         * 3. Reference from A to B added without notifying GC. E = [A -\> B].
         * 4. Summary 2 at t2. V = [A*, B]. E = [A -\> B].
         * Validates that we log an error since B is detected as a referenced node but its reference was notified
         * to GC.
         */
        it(`Scenario 7 - Reference added without notifying GC`, async () => {
            // Initialize nodes A & D.
            defaultGCData.gcNodes["/"] = [nodeA, nodeD];
            defaultGCData.gcNodes[nodeA] = [];
            defaultGCData.gcNodes[nodeD] = [];

            // 1. Run GC and generate summary 1. E = [].
            const timestamps1 = await getUnreferencedTimestamps();
            assert(timestamps1.get(nodeA) === undefined, "A should be referenced");
            assert(timestamps1.get(nodeD) === undefined, "D should be referenced");

            // 2. Create nodes B & C. E = [].
            defaultGCData.gcNodes[nodeB] = [];
            defaultGCData.gcNodes[nodeC] = [];

            // 3. Add reference from A to B, A to C, A to E, D to C, and E to A without calling addedOutboundReference.
            // E = [A -\> B, A -\> C, A -\> E, D -\> C, E -\> A].
            defaultGCData.gcNodes[nodeA] = [nodeB, nodeC, nodeE];
            defaultGCData.gcNodes[nodeD] = [nodeC];
            defaultGCData.gcNodes[nodeE] = [nodeA];

            // 4. Add reference from A to D with calling addedOutboundReference
            defaultGCData.gcNodes[nodeA].push(nodeD);
            garbageCollector.addedOutboundReference(nodeA, nodeD);

            // 5. Run GC and generate summary 2. E = [A -\> B, A -\> C, A -\> E, D -\> C, E -\> A].
            await getUnreferencedTimestamps();

            // Validate that we got the "gcUnknownOutboundReferences" error.
            const unknownReferencesEvent = "GarbageCollector:gcUnknownOutboundReferences";
            const eventsFound = mockLogger.matchEvents([
                {
                    eventName: unknownReferencesEvent,
                    gcNodeId: "/A",
                    gcRoutes: JSON.stringify(["/B", "/C"]),
                },
                {
                    eventName: unknownReferencesEvent,
                    gcNodeId: "/D",
                    gcRoutes: JSON.stringify(["/C"]),
                },
            ]);
            assert(eventsFound, `Expected unknownReferenceEvent event!`);
        });
    });

    describe("No changes to GC between summaries", () => {
        const settings = { "Fluid.GarbageCollection.TrackGCState": "true" };
        const fullTree = false;
        const trackState = true;
        let garbageCollector: IGarbageCollector;

        beforeEach(() => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            sessionStorageConfigProvider.value.getRawConfig = (name) => settings[name];
            // Initialize nodes A & D.
            defaultGCData.gcNodes = {};
            defaultGCData.gcNodes["/"] = nodes;
        });

        afterEach(() => {
            sessionStorageConfigProvider.value.getRawConfig = oldRawConfig;
        });

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const parseNothing: ReadAndParseBlob = async <T>() => { const x: T = {} as T; return x; };

        const checkGCSummaryType = (
            summary: ISummarizeResult | undefined,
            expectedBlobType: SummaryType,
            summaryNumber: string,
        ) => {
            assert(summary !== undefined, `Expected a summary on ${summaryNumber} summarize`);
            assert(
                summary.summary.type === expectedBlobType,
                `Expected summary type ${expectedBlobType} on ${summaryNumber} summarize, got ${summary.summary.type}`,
            );
        };

        it("No changes to GC between summaries creates a blob handle when no version specified", async () => {
            garbageCollector = createGarbageCollector();

            await garbageCollector.collectGarbage({ runGC: true });
            const tree1 = garbageCollector.summarize(fullTree, trackState);

            checkGCSummaryType(tree1, SummaryType.Tree, "first");

            await garbageCollector.latestSummaryStateRefreshed(
                { wasSummaryTracked: true, latestSummaryUpdated: true },
                parseNothing,
            );

            await garbageCollector.collectGarbage({ runGC: true });
            const tree2 = garbageCollector.summarize(fullTree, trackState);

            checkGCSummaryType(tree2, SummaryType.Handle, "second");
        });
    });
});
