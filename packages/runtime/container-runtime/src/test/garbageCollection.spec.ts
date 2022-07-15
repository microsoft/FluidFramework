/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
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
    IGarbageCollectorCreateParams,
    oneDayMs,
} from "../garbageCollection";
import { dataStoreAttributesBlobName, IContainerRuntimeMetadata } from "../summaryFormat";

describe("Garbage Collection Tests", () => {
    // Nodes in the reference graph.
    const nodes: string[] = [
        "/node1",
        "/node2",
        "/node3",
        "/node4",
    ];

    const mockLogger: MockLogger = new MockLogger();
    const mc = mixinMonitoringContext(mockLogger, sessionStorageConfigProvider.value);
    let closeCalled = false;
    const testPkgPath = ["testPkg"];
    // The package data is tagged in the telemetry event.
    const eventPkg = { value: testPkgPath.join("/"), tag: TelemetryDataTag.CodeArtifact };

    const oldRawConfig = sessionStorageConfigProvider.value.getRawConfig;
    let injectedSettings = {};
    let clock: SinonFakeTimers;

    // The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
    const defaultGCData: IGarbageCollectionData = { gcNodes: {} };

    function createGarbageCollector(
        createParams: Partial<IGarbageCollectorCreateParams> = {},
        gcBlobsMap: Map<string, IGarbageCollectionState | IGarbageCollectionDetailsBase> = new Map(),
        closeFn: (error?: ICriticalContainerError) => void = () => {},
    ) {
        const getNodeType = (nodePath: string) => {
            if (nodePath.split("/").length !== 2) {
                return GCNodeType.Other;
            }
            return GCNodeType.DataStore;
        };

        // The runtime to be passed to the garbage collector.
        const gcRuntime: IGarbageCollectionRuntime = {
            updateStateBeforeGC: async () => {},
            getGCData: async (fullGC?: boolean) => defaultGCData,
            updateUsedRoutes: (usedRoutes: string[]) => { return { totalNodeCount: 0, unusedNodeCount: 0 }; },
            deleteUnusedRoutes: (unusedRoutes: string[]) => {},
            getNodeType,
            getCurrentReferenceTimestampMs: () => Date.now(),
            closeFn,
        };

        return GarbageCollector.create({
            ...createParams,
            runtime: gcRuntime,
            gcOptions: createParams.gcOptions ?? {},
            baseSnapshot: createParams.baseSnapshot,
            baseLogger: mockLogger,
            existing: createParams.metadata !== undefined /* existing */,
            metadata: createParams.metadata,
            isSummarizerClient: true /* summarizerClient */,
            readAndParseBlob: async <T>(id: string) => gcBlobsMap.get(id) as T,
            getNodePackagePath: async (nodeId: string) => testPkgPath,
            getLastSummaryTimestampMs: () => Date.now(),
        });
    }

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

        const createGCOverride = (metadata?: IContainerRuntimeMetadata) => {
            return createGarbageCollector({ metadata }, undefined /* gcBlobsMap */, () => { closeCalled = true; });
        };

        it("Session expires for an existing container", async () => {
            const metadata: IContainerRuntimeMetadata =
                { summaryFormatVersion: 1, message: undefined, sessionExpiryTimeoutMs: 10 };
            createGCOverride(metadata);
            assert(closeCalledAfterExactTicks(10), "Close should have been called at exact expiry.");
        });

        it("Session expires for a new container", async () => {
            createGCOverride();
            assert(closeCalledAfterExactTicks(defaultSessionExpiryDurationMs), "Close should have been called at exact expiry.");
        });

        it("Session expiry disabled via DisableSessionExpiry config", async () => {
            // disable expiry even though it's set to run (meaning expiry value will present)
            injectedSettings[disableSessionExpiryKey] = "true";
            createGCOverride();
            assert(!closeCalledAfterExactTicks(defaultSessionExpiryDurationMs), "Close should NOT have been called due to disable.");
        });

        it("Session expiry explicitly not disabled via DisableSessionExpiry config", async () => {
            // Explicitly set value to false (instead of relying on undefined)
            injectedSettings[disableSessionExpiryKey] = "false";
            createGCOverride();
            assert(closeCalledAfterExactTicks(defaultSessionExpiryDurationMs), "Close should have been called at exact expiry.");
        });

        it("Session expiry overridden via TestOverride setting (existing container)", async () => {
            // Override expiry to 2 seconds
            injectedSettings[testOverrideSessionExpiryMsKey] = "2000";
            const customExpiryMs = mc.config.getNumber(testOverrideSessionExpiryMsKey);
            assert(customExpiryMs, "setting not found!");

            const metadata: IContainerRuntimeMetadata =
                { summaryFormatVersion: 1, message: undefined, sessionExpiryTimeoutMs: 10 };
            createGCOverride(metadata);
            assert(closeCalledAfterExactTicks(customExpiryMs), "Close should have been called at exact expiry.");
        });

        it("Session expiry overridden via TestOverride setting (new container)", async () => {
            // Override expiry to 2 seconds
            injectedSettings[testOverrideSessionExpiryMsKey] = "2000";
            const customExpiryMs = mc.config.getNumber(testOverrideSessionExpiryMsKey);
            assert(customExpiryMs, "setting not found!");

            createGCOverride();
            assert(closeCalledAfterExactTicks(customExpiryMs), "Close should have been called at exact expiry.");
        });

        it("Session expiry override ignored if RunSessionExpiry setting disabled", async () => {
            injectedSettings[runSessionExpiryKey] = "false";
            injectedSettings[testOverrideSessionExpiryMsKey] = "2000";
            const customExpiryMs = mc.config.getNumber(testOverrideSessionExpiryMsKey);
            assert(customExpiryMs, "setting not found!");

            createGCOverride();

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

            createGCOverride();

            clock.tick(customExpiryMs);
            assert(!closeCalled, "Close should not have been called since DisableSessionExpiry true.");
            clock.tick(defaultSessionExpiryDurationMs);
            assert(!closeCalled, "Close should not have been called since DisableSessionExpiry true.");
        });
    });

    describe("errors when unreferenced objects are used after they are inactive / deleted", () => {
        // Mock node loaded and changed activity for all the nodes in the graph.
         async function updateAllNodesAndRunGC(garbageCollector: IGarbageCollector) {
            nodes.forEach((nodeId) => {
                garbageCollector.nodeUpdated(nodeId, "Changed", Date.now(), testPkgPath);
                garbageCollector.nodeUpdated(nodeId, "Loaded", Date.now(), testPkgPath);
            });
            await garbageCollector.collectGarbage({});
        }

        beforeEach(async () => {
            // Set up the reference graph such that all nodes are referenced. Add in a couple of cycles in the graph.
            defaultGCData.gcNodes["/"] = [nodes[0]];
            defaultGCData.gcNodes[nodes[0]] = [nodes[1]];
            defaultGCData.gcNodes[nodes[1]] = [nodes[0], nodes[2]];
            defaultGCData.gcNodes[nodes[2]] = [nodes[3]];
            defaultGCData.gcNodes[nodes[3]] = [nodes[0]];
        });

        const tests = (
            timeout: number,
            revivedEventName: string,
            changedEventName: string,
            loadedEventName: string,
            snapshotCacheExpiryMs?: number,
            deleteEventName?: string,
        ) => {
            // Validates that no unexpected event has been fired.
            function validateNoUnexpectedEvents() {
                assert(
                    !mockLogger.matchAnyEvent([
                        { eventName: revivedEventName },
                        { eventName: changedEventName },
                        { eventName: loadedEventName },
                        { eventName: deleteEventName },
                    ]),
                    "unexpected events logged",
                );
            }

            // Returns a dummy snapshot tree to be built upon.
            const getDummySnapshotTree = (): ISnapshotTree => {
                return {
                    blobs: {},
                    trees: {},
                };
            };

            const createGCOverride = (
                baseSnapshot?: ISnapshotTree,
                gcBlobsMap?: Map<string, IGarbageCollectionState | IGarbageCollectionDetailsBase>,
            ) => {
                return createGarbageCollector({ baseSnapshot, snapshotCacheExpiryMs }, gcBlobsMap);
            };

            it("doesn't generate events for referenced nodes", async () => {
                const garbageCollector = createGCOverride();

                // Run garbage collection on the default GC data where everything is referenced.
                await garbageCollector.collectGarbage({});

                // Advance the clock just before the timeout and validate no events are generated.
                clock.tick(timeout - 1);
                await updateAllNodesAndRunGC(garbageCollector);
                validateNoUnexpectedEvents();

                // Advance the clock to expire the timeout.
                clock.tick(1);

                // Update all nodes again. Validate that no unexpected events are generated since everything is referenced.
                await updateAllNodesAndRunGC(garbageCollector);
                validateNoUnexpectedEvents();
            });

            it("generates events when nodes that are used after time out", async () => {
                const garbageCollector = createGCOverride();

                // Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
                defaultGCData.gcNodes[nodes[1]] = [];

                await garbageCollector.collectGarbage({});

                // Advance the clock just before the timeout and validate no unexpected events are logged.
                clock.tick(timeout - 1);
                await updateAllNodesAndRunGC(garbageCollector);
                validateNoUnexpectedEvents();

                // Expire the timeout and validate that all events for node 2 and node 3 are logged.
                clock.tick(1);
                await updateAllNodesAndRunGC(garbageCollector);
                const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
                if (deleteEventName) {
                    expectedEvents.push(
                        { eventName: deleteEventName, timeout, id: nodes[2] },
                        { eventName: deleteEventName, timeout, id: nodes[3] },
                    );
                }
                expectedEvents.push(
                    { eventName: changedEventName, timeout, id: nodes[2], pkg: eventPkg },
                    { eventName: loadedEventName, timeout, id: nodes[2], pkg: eventPkg },
                    { eventName: changedEventName, timeout, id: nodes[3], pkg: eventPkg },
                    { eventName: loadedEventName, timeout, id: nodes[3], pkg: eventPkg },
                );
                mockLogger.assertMatch(expectedEvents, "all events not generated as expected");

                // Add reference from node 1 to node 3 and validate that we get a revived event.
                garbageCollector.addedOutboundReference(nodes[1], nodes[3]);
                await garbageCollector.collectGarbage({});
                mockLogger.assertMatch(
                    [{ eventName: revivedEventName, timeout, id: nodes[3], pkg: eventPkg, fromId: nodes[1] }],
                    "revived event not generated as expected",
                );
            });

            it("generates only revived event when an inactive node is changed and revived", async () => {
                const garbageCollector = createGCOverride();

                // Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
                defaultGCData.gcNodes[nodes[1]] = [];

                await garbageCollector.collectGarbage({});

                // Advance the clock just before the timeout and validate no unexpected events are logged.
                clock.tick(timeout - 1);
                await updateAllNodesAndRunGC(garbageCollector);
                validateNoUnexpectedEvents();

                // Expire the timeout and validate that only revived event is generated for node 2.
                clock.tick(1);
                garbageCollector.nodeUpdated(nodes[2], "Changed", Date.now(), testPkgPath);
                garbageCollector.nodeUpdated(nodes[2], "Loaded", Date.now(), testPkgPath);
                garbageCollector.addedOutboundReference(nodes[1], nodes[2]);
                await garbageCollector.collectGarbage({});

                for (const event of mockLogger.events) {
                    assert.notStrictEqual(event.eventName, changedEventName, "Unexpected changed event logged");
                    assert.notStrictEqual(event.eventName, loadedEventName, "Unexpected loaded event logged");
                }
                mockLogger.assertMatch(
                    [{ eventName: revivedEventName, timeout, id: nodes[2], pkg: eventPkg, fromId: nodes[1] }],
                    "revived event not logged as expected",
                );
            });

            it("generates events once per node", async () => {
                const garbageCollector = createGCOverride();

                // Remove node 3's reference from node 2.
                defaultGCData.gcNodes[nodes[2]] = [];

                await garbageCollector.collectGarbage({});

                // Advance the clock just before the timeout and validate no unexpected events are logged.
                clock.tick(timeout - 1);
                await updateAllNodesAndRunGC(garbageCollector);
                validateNoUnexpectedEvents();

                // Expire the timeout and validate that all events for node 2 and node 3 are logged.
                clock.tick(1);
                await updateAllNodesAndRunGC(garbageCollector);
                const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
                if (deleteEventName) {
                    expectedEvents.push({ eventName: deleteEventName, timeout, id: nodes[3] });
                }
                expectedEvents.push(
                    { eventName: changedEventName, timeout, id: nodes[3], pkg: eventPkg },
                    { eventName: loadedEventName, timeout, id: nodes[3], pkg: eventPkg },
                );
                mockLogger.assertMatch(expectedEvents, "all events not generated as expected");

                // Update all nodes again. There shouldn't be any more events since for each node the event is only once.
                await updateAllNodesAndRunGC(garbageCollector);
                validateNoUnexpectedEvents();
            });

            /**
             * Here, the base snapshot contains nodes that have timed out. The test validates that we generate errors
             * when these nodes are used.
             */
            it("generates events for nodes that time out on load", async () => {
                // Create GC state where node 3's unreferenced time was > timeout ms ago.
                // This means this node should time out as soon as its data is loaded.

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
                    unreferencedTimestampMs: Date.now() - (timeout + 100),
                };
                gcState.gcNodes[nodes[3]] = node3Data;

                const gcBlobMap: Map<string, IGarbageCollectionState> = new Map([[gcBlobId, gcState]]);
                const garbageCollector = createGCOverride(baseSnapshot, gcBlobMap);

                // Remove node 3's reference from node 2 so that it is still unreferenced. The GC details from the base
                // summary is not loaded until the first time GC is run, so run GC.
                defaultGCData.gcNodes[nodes[2]] = [];

                await garbageCollector.collectGarbage({});
                // Validate that the sweep ready event is logged when GC runs after load.
                if (deleteEventName) {
                    mockLogger.assertMatch(
                        [{ eventName: deleteEventName, timeout, id: nodes[3] }],
                        "sweep ready event not generated as expected",
                    );
                }

                // Validate that all events are logged as expected.
                garbageCollector.nodeUpdated(nodes[3], "Changed", Date.now(), testPkgPath);
                garbageCollector.nodeUpdated(nodes[3], "Loaded", Date.now(), testPkgPath);
                await garbageCollector.collectGarbage({});
                mockLogger.assertMatch(
                    [
                        { eventName: changedEventName, timeout, id: nodes[3], pkg: eventPkg },
                        { eventName: loadedEventName, timeout, id: nodes[3], pkg: eventPkg },
                    ],
                    "all events not generated as expected",
                );

                // Add reference from node 2 to node 3 and validate that revived event is logged.
                garbageCollector.addedOutboundReference(nodes[2], nodes[3]);
                await garbageCollector.collectGarbage({});
                mockLogger.assertMatch(
                    [{ eventName: revivedEventName, timeout, id: nodes[3], pkg: eventPkg, fromId: nodes[2] }],
                    "revived event not generated as expected",
                );
            });

            /**
             * Here, the base snapshot contains nodes that have timed out and the GC blob in snapshot is in old format. The
             * test validates that we generate errors when these nodes are used.
             */
            it("generates events for nodes that time out on load - old snapshot format", async () => {
                // Create GC details for node 3's GC blob whose unreferenced time was > timeout ms ago.
                // This means this node should time out as soon as its data is loaded.
                const node3GCDetails: IGarbageCollectionDetailsBase = {
                    gcData: { gcNodes: { "/": [] } },
                    unrefTimestamp: Date.now() - (timeout + 100),
                };
                const node3Snapshot = getDummySnapshotTree();
                const gcBlobId = "node3GCDetails";
                const attributesBlobId = "attributesBlob";
                node3Snapshot.blobs[gcBlobKey] = gcBlobId;
                node3Snapshot.blobs[dataStoreAttributesBlobName] = attributesBlobId;

                // Create a base snapshot that contains snapshot tree of node 3.
                const baseSnapshot = getDummySnapshotTree();
                baseSnapshot.trees[nodes[3].slice(1)] = node3Snapshot;

                // Set up the getNodeGCDetails function to return the GC details for node 3 when asked by garbage collector.
                const gcBlobMap = new Map([
                    [gcBlobId, node3GCDetails],
                    [attributesBlobId, {}],
                ]);
                const garbageCollector = createGCOverride(baseSnapshot, gcBlobMap);

                // Remove node 3's reference from node 2 so that it is still unreferenced. The GC details from the base
                // summary is not loaded until the first time GC is run, so do that immediately.
                defaultGCData.gcNodes[nodes[2]] = [];
                await garbageCollector.collectGarbage({});

                // Validate that the sweep ready event is logged when GC runs after load.
                if (deleteEventName) {
                    mockLogger.assertMatch(
                        [{ eventName: deleteEventName, timeout, id: nodes[3] }],
                        "sweep ready event not generated as expected",
                    );
                }

                // Validate that all events are logged as expected.
                garbageCollector.nodeUpdated(nodes[3], "Changed", Date.now(), testPkgPath);
                garbageCollector.nodeUpdated(nodes[3], "Loaded", Date.now(), testPkgPath);
                await garbageCollector.collectGarbage({});
                mockLogger.assertMatch(
                    [
                        { eventName: changedEventName, timeout, id: nodes[3], pkg: eventPkg },
                        { eventName: loadedEventName, timeout, id: nodes[3], pkg: eventPkg },
                    ],
                    "all events not generated as expected",
                );

                // Add reference from node 2 to node 3 and validate that revived event is logged.
                garbageCollector.addedOutboundReference(nodes[2], nodes[3]);
                await garbageCollector.collectGarbage({});
                mockLogger.assertMatch(
                    [{ eventName: revivedEventName, timeout, id: nodes[3], pkg: eventPkg, fromId: nodes[2] }],
                    "revived event not generated as expected",
                );
            });

            /**
             * Here, the base snapshot contains nodes that have timed out and the GC data in snapshot is present in multiple
             * blobs. The test validates that we generate errors when these nodes are used.
             */
            it(`generates events for nodes that time out on load - multi blob GC data`, async () => {
                const gcBlobMap: Map<string, IGarbageCollectionState> = new Map();
                const expiredTimestampMs = Date.now() - (timeout + 100);

                // Create three GC states to be added into separate GC blobs. Each GC state has a node whose unreferenced
                // time was > timeout ms ago. These three GC blobs are the added to the GC tree in summary.
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

                const garbageCollector = createGCOverride(baseSnapshot, gcBlobMap);

                // For the nodes in the GC snapshot blobs, remove their references from the default GC data.
                defaultGCData.gcNodes[nodes[0]] = [];
                defaultGCData.gcNodes[nodes[1]] = [];
                defaultGCData.gcNodes[nodes[2]] = [];

                await garbageCollector.collectGarbage({});
                 // Validate that the sweep ready event is logged when GC runs after load.
                 if (deleteEventName) {
                    mockLogger.assertMatch(
                        [
                            { eventName: deleteEventName, timeout, id: nodes[1] },
                            { eventName: deleteEventName, timeout, id: nodes[2] },
                            { eventName: deleteEventName, timeout, id: nodes[3] },
                        ],
                        "sweep ready event not generated as expected",
                    );
                }

                // Validate that all events are logged as expected.
                garbageCollector.nodeUpdated(nodes[1], "Changed", Date.now(), testPkgPath);
                garbageCollector.nodeUpdated(nodes[2], "Changed", Date.now(), testPkgPath);
                garbageCollector.nodeUpdated(nodes[3], "Loaded", Date.now(), testPkgPath);
                await garbageCollector.collectGarbage({});
                mockLogger.assertMatch(
                    [
                        { eventName: changedEventName, timeout, id: nodes[1], pkg: eventPkg },
                        { eventName: changedEventName, timeout, id: nodes[2], pkg: eventPkg },
                        { eventName: loadedEventName, timeout, id: nodes[3], pkg: eventPkg },
                    ],
                    "all events not generated as expected",
                );
            });
        };

        describe("Inactive events", () => {
            const inactiveTimeoutMs = 500;

            beforeEach(() => {
                injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = inactiveTimeoutMs;
            });

            tests(
                inactiveTimeoutMs,
                "GarbageCollector:InactiveObject_Revived",
                "GarbageCollector:InactiveObject_Changed",
                "GarbageCollector:InactiveObject_Loaded",
            );
        });

        describe("Sweep ready events", () => {
            const snapshotCacheExpiryMs = 500;
            const sweepTimeoutMs = defaultSessionExpiryDurationMs + snapshotCacheExpiryMs + oneDayMs;

            beforeEach(() => {
                injectedSettings[runSessionExpiryKey] = "true";
            });

            tests(
                sweepTimeoutMs,
                "GarbageCollector:SweepReadyObject_Revived",
                "GarbageCollector:SweepReadyObject_Changed",
                "GarbageCollector:SweepReadyObject_Loaded",
                snapshotCacheExpiryMs,
                "GarbageCollector:GCObjectDeleted",
            );
        });

        it("generates both inactive and sweep ready events when nodes are used after time out", async () => {
            const inactiveTimeoutMs = 500;
            const snapshotCacheExpiryMs = 500;
            const sweepTimeoutMs = defaultSessionExpiryDurationMs + snapshotCacheExpiryMs + oneDayMs;
            injectedSettings[runSessionExpiryKey] = "true";
            injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = inactiveTimeoutMs;

            const garbageCollector = createGarbageCollector({ snapshotCacheExpiryMs });

            // Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
            defaultGCData.gcNodes[nodes[1]] = [];
            await garbageCollector.collectGarbage({});

            // Advance the clock to trigger inactive timeout and validate that we get inactive events.
            clock.tick(inactiveTimeoutMs + 1);
            await updateAllNodesAndRunGC(garbageCollector);
            mockLogger.assertMatch(
                [
                    { eventName: "GarbageCollector:InactiveObject_Changed", timeout: inactiveTimeoutMs, id: nodes[2] },
                    { eventName: "GarbageCollector:InactiveObject_Loaded", timeout: inactiveTimeoutMs, id: nodes[2] },
                    { eventName: "GarbageCollector:InactiveObject_Changed", timeout: inactiveTimeoutMs, id: nodes[3] },
                    { eventName: "GarbageCollector:InactiveObject_Loaded", timeout: inactiveTimeoutMs, id: nodes[3] },
                ],
                "inactive events not generated as expected",
            );

            // Advance the clock to trigger sweep timeout and validate that we get sweep ready events.
            clock.tick(sweepTimeoutMs - inactiveTimeoutMs);
            await updateAllNodesAndRunGC(garbageCollector);
            mockLogger.assertMatch(
                [
                    { eventName: "GarbageCollector:SweepReadyObject_Changed", timeout: sweepTimeoutMs, id: nodes[2] },
                    { eventName: "GarbageCollector:SweepReadyObject_Loaded", timeout: sweepTimeoutMs, id: nodes[2] },
                    { eventName: "GarbageCollector:SweepReadyObject_Changed", timeout: sweepTimeoutMs, id: nodes[3] },
                    { eventName: "GarbageCollector:SweepReadyObject_Loaded", timeout: sweepTimeoutMs, id: nodes[3] },
                ],
                "sweep ready events not generated as expected",
            );
        });
    });

    describe("GC completed runs", () => {
        const gcEndEvent = "GarbageCollector:GarbageCollection_end";

        it("increments GC completed runs in logged events correctly", async () => {
            const garbageCollector = createGarbageCollector();

            await garbageCollector.collectGarbage({});
            mockLogger.assertMatch(
                [{ eventName: gcEndEvent, completedGCRuns: 0 }],
                "completedGCRuns should be 0 since this event was logged before first GC run completed",
            );

            await garbageCollector.collectGarbage({});
            mockLogger.assertMatch(
                [{ eventName: gcEndEvent, completedGCRuns: 1 }],
                "completedGCRuns should be 1 since this event was logged after first GC run completed",
            );

            await garbageCollector.collectGarbage({});
            mockLogger.assertMatch(
                [{ eventName: gcEndEvent, completedGCRuns: 2 }],
                "completedGCRuns should be 2 since this event was logged after second GC run completed",
            );

            // The GC run count should reset for new garbage collector.
            const garbageCollector2 = createGarbageCollector();
            await garbageCollector2.collectGarbage({});
            mockLogger.assertMatch(
                [{ eventName: gcEndEvent, completedGCRuns: 0 }],
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

            await garbageCollector.collectGarbage({});

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

            await garbageCollector.collectGarbage({});
            const tree1 = garbageCollector.summarize(fullTree, trackState);

            checkGCSummaryType(tree1, SummaryType.Tree, "first");

            await garbageCollector.latestSummaryStateRefreshed(
                { wasSummaryTracked: true, latestSummaryUpdated: true },
                parseNothing,
            );

            await garbageCollector.collectGarbage({});
            const tree2 = garbageCollector.summarize(fullTree, trackState);

            checkGCSummaryType(tree2, SummaryType.Handle, "second");
        });
    });
});
