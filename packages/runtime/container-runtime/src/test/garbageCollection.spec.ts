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
import {
    MockLogger,
    sessionStorageConfigProvider,
    TelemetryDataTag,
    ConfigTypes,
} from "@fluidframework/telemetry-utils";
import { ReadAndParseBlob } from "@fluidframework/runtime-utils";
import { Timer } from "@fluidframework/common-utils";
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
    runGCKey,
    runSweepKey,
    defaultInactiveTimeoutMs,
    gcTestModeKey,
    disableSweepLogKey,
} from "../garbageCollection";
import { dataStoreAttributesBlobName, GCVersion, IContainerRuntimeMetadata, IGCMetadata } from "../summaryFormat";
import { IGCRuntimeOptions } from "../containerRuntime";

/** @see - sweepReadyUsageDetectionSetting */
const SweepReadyUsageDetectionKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection";

type GcWithPrivates = IGarbageCollector & {
    readonly gcEnabled: boolean;
    readonly sweepEnabled: boolean;
    readonly shouldRunGC: boolean;
    readonly shouldRunSweep: boolean;
    readonly trackGCState: boolean;
    readonly testMode: boolean;
    readonly latestSummaryGCVersion: GCVersion;
    readonly sessionExpiryTimeoutMs: number | undefined;
    readonly inactiveTimeoutMs: number;
    readonly sweepTimeoutMs: number | undefined;
    readonly sessionExpiryTimer: Omit<Timer, "defaultTimeout"> & { defaultTimeout: number; };
};

describe("Garbage Collection Tests", () => {
    // Nodes in the reference graph.
    const nodes: string[] = [
        "/node1",
        "/node2",
        "/node3",
        "/node4",
    ];

    const mockLogger: MockLogger = new MockLogger();
    const testPkgPath = ["testPkg"];
    // The package data is tagged in the telemetry event.
    const eventPkg = { value: testPkgPath.join("/"), tag: TelemetryDataTag.CodeArtifact };

    const oldRawConfig = sessionStorageConfigProvider.value.getRawConfig;
    let injectedSettings: Record<string, ConfigTypes> = {};
    let clock: SinonFakeTimers;

    // The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
    const defaultGCData: IGarbageCollectionData = { gcNodes: {} };

    function createGarbageCollector(
        createParams: Partial<IGarbageCollectorCreateParams> = {},
        gcBlobsMap: Map<string, IGarbageCollectionState | IGarbageCollectionDetailsBase> = new Map(),
        closeFn: (error?: ICriticalContainerError) => void = () => {},
        isSummarizerClient: boolean = true,
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
            isSummarizerClient,
            readAndParseBlob: async <T>(id: string) => gcBlobsMap.get(id) as T,
            getNodePackagePath: async (nodeId: string) => testPkgPath,
            getLastSummaryTimestampMs: () => Date.now(),
            activeConnection: () => true,
            getContainerDiagnosticId: () => "someDocId",
        });
    }
    let gc: GcWithPrivates | undefined;

    before(() => {
        clock = useFakeTimers();
        sessionStorageConfigProvider.value.getRawConfig = (name) => injectedSettings[name];
    });

    beforeEach(() => {
        gc = undefined;
    });

    afterEach(() => {
        clock.reset();
        mockLogger.clear();
        injectedSettings = {};
        gc?.dispose();
    });

    after(() => {
        clock.restore();
        sessionStorageConfigProvider.value.getRawConfig = oldRawConfig;
    });

    describe("Configuration", () => {
        const createGcWithPrivateMembers = (gcMetadata?: IGCMetadata, gcOptions?: IGCRuntimeOptions, snapshotCacheExpiryMs?: number): GcWithPrivates => {
            const metadata: IContainerRuntimeMetadata | undefined = gcMetadata && { summaryFormatVersion: 1, message: undefined, ...gcMetadata };
            return createGarbageCollector({ metadata, gcOptions, snapshotCacheExpiryMs }) as GcWithPrivates;
        };
        const customSessionExpiryDurationMs = defaultSessionExpiryDurationMs + 1;
        describe("Existing container", () => {
            it("No metadata", () => {
                gc = createGcWithPrivateMembers({});
                assert(!gc.gcEnabled, "gcEnabled incorrect");
                assert(!gc.sweepEnabled, "sweepEnabled incorrect");
                assert(gc.sessionExpiryTimeoutMs === undefined, "sessionExpiryTimeoutMs incorrect");
                assert(gc.sweepTimeoutMs === undefined, "sweepTimeoutMs incorrect");
                assert.equal(gc.latestSummaryGCVersion, 0, "latestSummaryGCVersion incorrect");
            });
            it("gcFeature 0", () => {
                gc = createGcWithPrivateMembers({ gcFeature: 0 });
                assert(!gc.gcEnabled, "gcEnabled incorrect");
                assert.equal(gc.latestSummaryGCVersion, 0, "latestSummaryGCVersion incorrect");
            });
            it("gcFeature 0, sweepEnabled true", () => {
                gc = createGcWithPrivateMembers({ gcFeature: 0, sweepEnabled: true });
                assert(!gc.gcEnabled, "gcEnabled incorrect");
                assert(gc.sweepEnabled, "sweepEnabled incorrect");
                assert.equal(gc.latestSummaryGCVersion, 0, "latestSummaryGCVersion incorrect");
            });
            it("gcFeature 1", () => {
                gc = createGcWithPrivateMembers({ gcFeature: 1 });
                assert(gc.gcEnabled, "gcEnabled incorrect");
                assert.equal(gc.latestSummaryGCVersion, 1, "latestSummaryGCVersion incorrect");
            });
            it("sweepEnabled false", () => {
                gc = createGcWithPrivateMembers({ sweepEnabled: false });
                assert(!gc.sweepEnabled, "sweepEnabled incorrect");
            });
            it("sessionExpiryTimeoutMs set", () => {
                gc = createGcWithPrivateMembers({ sessionExpiryTimeoutMs: customSessionExpiryDurationMs });
                assert.equal(gc.sessionExpiryTimeoutMs, customSessionExpiryDurationMs, "sessionExpiryTimeoutMs incorrect");
            });
            it("Metadata Roundtrip", () => {
                const inputMetadata: IGCMetadata = { sweepEnabled: true, gcFeature: 1, sessionExpiryTimeoutMs: customSessionExpiryDurationMs };
                gc = createGcWithPrivateMembers(inputMetadata);
                const outputMetadata = gc.getMetadata();
                assert.deepEqual(outputMetadata, inputMetadata, "getMetadata returned different metadata than loaded from");
            });
        });

        describe("New Container", () => {
            it("No options", () => {
                injectedSettings[runSessionExpiryKey] = true;
                gc = createGcWithPrivateMembers(undefined /* metadata */, {});
                assert(gc.gcEnabled, "gcEnabled incorrect");
                assert(!gc.sweepEnabled, "sweepEnabled incorrect");
                assert(gc.sessionExpiryTimeoutMs !== undefined, "sessionExpiryTimeoutMs incorrect");
                assert(gc.sweepTimeoutMs !== undefined, "sweepTimeoutMs incorrect");
                assert.equal(gc.latestSummaryGCVersion, 1, "latestSummaryGCVersion incorrect");
            });
            it("gcAllowed true", () => {
                gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: true });
                assert(gc.gcEnabled, "gcEnabled incorrect");
            });
            it("gcAllowed false", () => {
                gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: false });
                assert(!gc.gcEnabled, "gcEnabled incorrect");
            });
            it("sweepAllowed true, gcAllowed false", () => {
                assert.throws(
                    () => { gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: false, sweepAllowed: true }); },
                    (e) => e.errorType === "usageError",
                    "Should be unsupported");
            });
            it("sweepAllowed true, gcAllowed true, no snapshotCacheExpiryMs", () => {
                injectedSettings[runSessionExpiryKey] = true;
                gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: true, sweepAllowed: true });
                assert(gc.gcEnabled, "gcEnabled incorrect");
                assert(gc.sweepEnabled, "sweepEnabled incorrect");
                assert(!gc.shouldRunSweep, "shouldRunSweep incorrect");
                assert(gc.sweepTimeoutMs !== undefined, "sweepTimeoutMs incorrect"); // Only because of TEMPORARY measure to provide default value of snapshotExpiry
                assert(gc.sessionExpiryTimeoutMs !== undefined, "sessionExpiryTimeoutMs incorrect");
            });
            it("sweepAllowed true, gcAllowed true, with snapshotCacheExpiryMs", () => {
                injectedSettings[runSessionExpiryKey] = true;
                gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: true, sweepAllowed: true }, 123 /* snapshotCacheExpiryMs */);
                assert(gc.gcEnabled, "gcEnabled incorrect");
                assert(gc.sweepEnabled, "sweepEnabled incorrect");
                assert(gc.sweepTimeoutMs !== undefined, "sweepTimeoutMs incorrect");
                assert(gc.sessionExpiryTimeoutMs !== undefined, "sessionExpiryTimeoutMs incorrect");
            });
            it("sweepAllowed true, gcAllowed true, sessionExpiry off", () => {
                injectedSettings[runSessionExpiryKey] = false;
                gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: true, sweepAllowed: true });
                assert(gc.gcEnabled, "gcEnabled incorrect");
                assert(gc.sweepEnabled, "sweepEnabled incorrect");
                assert(gc.sessionExpiryTimeoutMs === undefined, "sessionExpiryTimeoutMs incorrect");
            });
            it("sweepAllowed false, sessionExpiry on", () => {
                injectedSettings[runSessionExpiryKey] = true;
                gc = createGcWithPrivateMembers(undefined /* metadata */, { sweepAllowed: false });
                assert(gc.gcEnabled, "gcEnabled incorrect");
                assert(!gc.sweepEnabled, "sweepEnabled incorrect");
                assert(gc.sessionExpiryTimeoutMs !== undefined, "sessionExpiryTimeoutMs incorrect");
            });
            it("sweepAllowed false, sessionExpiry off", () => {
                injectedSettings[runSessionExpiryKey] = false;
                gc = createGcWithPrivateMembers(undefined /* metadata */, { sweepAllowed: false });
                assert(gc.gcEnabled, "gcEnabled incorrect");
                assert(!gc.sweepEnabled, "sweepEnabled incorrect");
                assert(gc.sessionExpiryTimeoutMs === undefined, "sessionExpiryTimeoutMs incorrect");
            });
            it("Metadata Roundtrip", () => {
                injectedSettings[runSessionExpiryKey] = true;
                const expectedMetadata: IGCMetadata = { sweepEnabled: true, gcFeature: 1, sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs };
                gc = createGcWithPrivateMembers(undefined /* metadata */, { sweepAllowed: true });
                const outputMetadata = gc.getMetadata();
                assert.deepEqual(outputMetadata, expectedMetadata, "getMetadata returned different metadata than expected");
            });
        });

        describe("Session Expiry and Sweep Timeout", () => {
            const testOverrideSessionExpiryMsKey = "Fluid.GarbageCollection.TestOverride.SessionExpiryMs";
            const defaultSnapshotCacheExpiryMs = 5 * 24 * 60 * 60 * 1000;
            beforeEach(() => {
                injectedSettings[runSessionExpiryKey] = true;
                injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = 1; // To ensure it's less than sweep timeout
            });

            // Config sources for Session Expiry:
            // 1. defaultSessionExpiryDurationMs in code
            // 2. IGCRuntimeOptions.sessionExpiryTimeoutMs
            // 3. IGCMetadata.sessionExpiryTimeoutMs
            // 4. "Fluid.GarbageCollection.TestOverride.SessionExpiryMs" setting
            // 5. boolean settings: runSessionExpiryKey and disableSessionExpiryKey
            // Sweep Timeout considerations:
            // - Computed from Session Expiry, Snapshot Expiry and a fixed buffer
            // - Only set if Session Expiry timer is set, but using Session Expiry value written to file

            function validateSweepTimeout(snapshotCacheExpiryMs: number = defaultSnapshotCacheExpiryMs) {
                assert(!!gc, "PRECONDITION: gc must be set before calling this helper");
                if (gc.sessionExpiryTimeoutMs === undefined) {
                    assert.equal(gc.sweepTimeoutMs, undefined, "sweepTimeoutMs should be undefined if sessionExpiryTimeoutMs is undefined");
                } else {
                    assert.equal(gc.sweepTimeoutMs, gc.sessionExpiryTimeoutMs + snapshotCacheExpiryMs + oneDayMs);
                }
            }

            it("defaultSessionExpiryDurationMs", () => {
                gc = createGcWithPrivateMembers();
                assert.equal(gc.sessionExpiryTimeoutMs, defaultSessionExpiryDurationMs, "sessionExpiryTimeoutMs incorrect");
                assert.equal(gc.sessionExpiryTimer.defaultTimeout, defaultSessionExpiryDurationMs, "sessionExpiryTimer incorrect");
                validateSweepTimeout();
            });
            it("defaultSessionExpiryDurationMs with custom snapshotCacheExpiryMs", () => {
                gc = createGcWithPrivateMembers(undefined /* metadata */, {}, 12345);
                assert.equal(gc.sessionExpiryTimeoutMs, defaultSessionExpiryDurationMs, "sessionExpiryTimeoutMs incorrect");
                assert.equal(gc.sessionExpiryTimer.defaultTimeout, defaultSessionExpiryDurationMs, "sessionExpiryTimer incorrect");
                validateSweepTimeout(12345);
            });
            it("IGCRuntimeOptions.sessionExpiryTimeoutMs", () => {
                gc = createGcWithPrivateMembers(undefined /* metadata */, { sessionExpiryTimeoutMs: 123 });
                assert.equal(gc.sessionExpiryTimeoutMs, 123, "sessionExpiryTimeoutMs incorrect");
                assert.equal(gc.sessionExpiryTimer.defaultTimeout, 123, "sessionExpiryTimer incorrect");
                validateSweepTimeout();
            });
            it("IGCMetadata.sessionExpiryTimeoutMs", () => {
                gc = createGcWithPrivateMembers({ sessionExpiryTimeoutMs: 456 } /* metadata */);
                assert.equal(gc.sessionExpiryTimeoutMs, 456, "sessionExpiryTimeoutMs incorrect");
                assert.equal(gc.sessionExpiryTimer.defaultTimeout, 456, "sessionExpiryTimer incorrect");
                validateSweepTimeout();
            });
            function testSessionExpiryMsOverride() {
                assert(!!gc, "PRECONDITION: gc must be set before calling this helper");
                assert.equal(gc.sessionExpiryTimeoutMs, defaultSessionExpiryDurationMs, "sessionExpiryTimeoutMs incorrect");
                assert.equal(gc.sessionExpiryTimer.defaultTimeout, 789, "sessionExpiry used for timer should be the override value");
                validateSweepTimeout();

                const expectedMetadata: IGCMetadata = { sweepEnabled: false, gcFeature: 1, sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs };
                const outputMetadata = gc.getMetadata();
                assert.deepEqual(outputMetadata, expectedMetadata, "getMetadata returned different metadata than expected");
            }
            it("TestOverride.SessionExpiryMs setting applied to timeout but not written to file - New Container", () => {
                injectedSettings[testOverrideSessionExpiryMsKey] = 789;
                gc = createGcWithPrivateMembers();
                testSessionExpiryMsOverride();
            });
            it("TestOverride.SessionExpiryMs setting applied to timeout but not written to file - Existing Container", () => {
                injectedSettings[testOverrideSessionExpiryMsKey] = 789;
                gc = createGcWithPrivateMembers({ sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs, gcFeature: 1 } /* metadata */);
                testSessionExpiryMsOverride();
            });
            it("RunSessionExpiry setting turned off", () => {
                injectedSettings[runSessionExpiryKey] = false;
                injectedSettings[testOverrideSessionExpiryMsKey] = 1234; // This override should be ignored
                gc = createGcWithPrivateMembers();
                assert.equal(gc.sessionExpiryTimeoutMs, undefined, "sessionExpiryTimeoutMs should be undefined if runSessionExpiryKey setting is false");
                assert.equal(gc.sessionExpiryTimer, undefined, "sessionExpiryTimer should be undefined if it's disabled");
                validateSweepTimeout();
            });
            it("Disable SessionExpiry", () => {
                injectedSettings[disableSessionExpiryKey] = true;
                injectedSettings[testOverrideSessionExpiryMsKey] = 1234; // This override should be ignored
                gc = createGcWithPrivateMembers();
                assert.equal(gc.sessionExpiryTimeoutMs, defaultSessionExpiryDurationMs, "sessionExpiryTimeoutMs should be set even if disabled");
                assert.equal(gc.sessionExpiryTimer, undefined, "sessionExpiryTimer should be undefined if it's disabled");
                // (validateSweepTimeout doesn't try to handle this case)
                assert.equal(gc.sweepTimeoutMs, undefined, "sweepTimeoutMs should be undefined if SessionExpiry is disabled");
            });
        });

        describe("Session Behavior (e.g. 'shouldRun' fields)", () => {
            beforeEach(() => {
                injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = 1; // To ensure it's less than sweep timeout
            });

            describe("shouldRunGC", () => {
                const testCases: { gcEnabled: boolean; disableGC?: boolean; runGC?: boolean; expectedResult: boolean; }[] = [
                    { gcEnabled: false, disableGC: true, runGC: true, expectedResult: true },
                    { gcEnabled: true, disableGC: false, runGC: false, expectedResult: false },
                    { gcEnabled: true, disableGC: true, expectedResult: false },
                    { gcEnabled: true, disableGC: false, expectedResult: true },
                    { gcEnabled: true, expectedResult: true },
                    { gcEnabled: false, expectedResult: false },
                ];
                testCases.forEach((testCase) => {
                    it(`Test Case ${JSON.stringify(testCase)}`, () => {
                        injectedSettings[runGCKey] = testCase.runGC;
                        gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: testCase.gcEnabled, disableGC: testCase.disableGC });
                        assert.equal(gc.gcEnabled, testCase.gcEnabled, "PRECONDITION: gcEnabled set incorrectly");
                        assert.equal(gc.shouldRunGC, testCase.expectedResult, "shouldRunGC not set as expected");
                    });
                });
            });
            describe("shouldRunSweep", () => {
                const testCases: { shouldRunGC: boolean; setSweepTimeout: boolean; sweepEnabled: boolean; runSweep?: boolean; expectedResult: boolean; }[] = [
                    { shouldRunGC: false, setSweepTimeout: true, sweepEnabled: true, runSweep: true, expectedResult: false },
                    { shouldRunGC: true, setSweepTimeout: false, sweepEnabled: true, runSweep: true, expectedResult: false },
                    { shouldRunGC: true, setSweepTimeout: true, sweepEnabled: true, runSweep: false, expectedResult: false },
                    { shouldRunGC: true, setSweepTimeout: true, sweepEnabled: false, runSweep: true, expectedResult: false }, // { expectedResult: true } once TEMPORARY snapshotCacheExpiryMs measure is reverted
                    { shouldRunGC: true, setSweepTimeout: true, sweepEnabled: true, expectedResult: false }, // { expectedResult: true } once TEMPORARY snapshotCacheExpiryMs measure is reverted
                    { shouldRunGC: true, setSweepTimeout: true, sweepEnabled: false, expectedResult: false },
                ];
                testCases.forEach((testCase) => {
                    it(`Test Case ${JSON.stringify(testCase)}`, () => {
                        injectedSettings[runGCKey] = testCase.shouldRunGC;
                        injectedSettings[runSweepKey] = testCase.runSweep;
                        injectedSettings[runSessionExpiryKey] = testCase.setSweepTimeout; // Sweep timeout is set iff sessionExpiry runs (under other default inputs)
                        gc = createGcWithPrivateMembers(undefined /* metadata */, { sweepAllowed: testCase.sweepEnabled });
                        assert.equal(gc.shouldRunGC, testCase.shouldRunGC, "PRECONDITION: shouldRunGC set incorrectly");
                        assert.equal(gc.sweepTimeoutMs !== undefined, testCase.setSweepTimeout, "PRECONDITION: sweep timeout set incorrectly");
                        assert.equal(gc.sweepEnabled, testCase.sweepEnabled, "PRECONDITION: sweepEnabled set incorrectly");
                        assert.equal(gc.shouldRunSweep, testCase.expectedResult, "shouldRunSweep not set as expected");
                    });
                });
            });
            describe("inactiveTimeoutMs", () => {
                beforeEach(() => {
                    // Remove setting added in outer describe block
                    injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = undefined;
                });
                const testCases: { testOverride?: number; option?: number; expectedResult: number; }[] = [
                    { testOverride: 123, option: 456, expectedResult: 123 },
                    { option: 456, expectedResult: 456 },
                    { expectedResult: defaultInactiveTimeoutMs },
                ];
                testCases.forEach((testCase) => {
                    it(`Test Case ${JSON.stringify(testCase)}`, () => {
                        injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = testCase.testOverride;
                        gc = createGcWithPrivateMembers(undefined /* metadata */, { inactiveTimeoutMs: testCase.option });
                        assert.equal(gc.inactiveTimeoutMs, testCase.expectedResult, "inactiveTimeoutMs not set as expected");
                    });
                });
                it("inactiveTimeout must not be greater than sweepTimeout", () => {
                    injectedSettings[runSessionExpiryKey] = true;
                    injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = Number.MAX_VALUE;
                    assert.throws(
                        () => { gc = createGcWithPrivateMembers(); },
                        (e) => e.errorType === "usageError",
                        "inactiveTimeout must not be greater than sweepTimeout");
                });
            });
            describe("testMode", () => {
                const testCases: { setting?: boolean; option?: boolean; expectedResult: boolean; }[] = [
                    { setting: true, option: false, expectedResult: true },
                    { setting: false, option: true, expectedResult: false },
                    { option: true, expectedResult: true },
                    { expectedResult: false },
                ];
                testCases.forEach((testCase) => {
                    it(`Test Case ${JSON.stringify(testCase)}`, () => {
                        injectedSettings[gcTestModeKey] = testCase.setting;
                        gc = createGcWithPrivateMembers(undefined /* metadata */, { runGCInTestMode: testCase.option });
                        assert.equal(gc.testMode, testCase.expectedResult, "testMode not set as expected");
                    });
                });
            });
        });
    });

    it("Session expiry closes container", () => {
        injectedSettings[runSessionExpiryKey] = "true";

        let closeCalled = false;
        function closeCalledAfterExactTicks(ticks: number) {
            clock.tick(ticks - 1);
            if (closeCalled) {
                return false;
            }
            clock.tick(1);
            return closeCalled;
        }

        gc = createGarbageCollector({ }, undefined /* gcBlobsMap */, () => { closeCalled = true; }) as GcWithPrivates;
        assert(closeCalledAfterExactTicks(defaultSessionExpiryDurationMs), "Close should have been called at exactly defaultSessionExpiryDurationMs");
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
            // Here's a diagram showing the references:
            // 0 - 1 - 2 - 3
            // |  /       /
            // |-/-------/
            defaultGCData.gcNodes["/"] = [nodes[0]];
            defaultGCData.gcNodes[nodes[0]] = [nodes[1]];
            defaultGCData.gcNodes[nodes[1]] = [nodes[0], nodes[2]];
            defaultGCData.gcNodes[nodes[2]] = [nodes[3]];
            defaultGCData.gcNodes[nodes[3]] = [nodes[0]];
        });

        // Returns a dummy snapshot tree to be built upon.
        const getDummySnapshotTree = (): ISnapshotTree => {
            return {
                blobs: {},
                trees: {},
            };
        };

        const summarizerContainerTests = (
            timeout: number,
            revivedEventName: string,
            changedEventName: string,
            loadedEventName: string,
            snapshotCacheExpiryMs?: number,
            expectDeleteLogs?: boolean,
        ) => {
            const deleteEventName = "GarbageCollector:GCObjectDeleted";
            // Validates that no unexpected event has been fired.
            function validateNoUnexpectedEvents() {
                mockLogger.assertMatchNone([
                        { eventName: revivedEventName },
                        { eventName: changedEventName },
                        { eventName: loadedEventName },
                        { eventName: deleteEventName },
                    ],
                    "unexpected events logged",
                );
            }

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

            it("generates events for nodes that are used after time out", async () => {
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

                if (expectDeleteLogs) {
                    expectedEvents.push(
                        { eventName: deleteEventName, timeout, id: nodes[2] },
                        { eventName: deleteEventName, timeout, id: nodes[3] },
                    );
                } else {
                    assert(!mockLogger.events.some((event) => event.eventName === deleteEventName), "Should not have any delete events logged");
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
                if (expectDeleteLogs) {
                    expectedEvents.push({ eventName: deleteEventName, timeout, id: nodes[3] });
                } else {
                    assert(!mockLogger.events.some((event) => event.eventName === deleteEventName), "Should not have any delete events logged");
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

                // Remove node 3's reference from node 2 so that it is still unreferenced.
                defaultGCData.gcNodes[nodes[2]] = [];

                // Run GC to trigger loading the GC details from the base summary. Will also generate Delete logs
                await garbageCollector.collectGarbage({});
                // Validate that the sweep ready event is logged when GC runs after load.
                if (expectDeleteLogs) {
                    mockLogger.assertMatch(
                        [{ eventName: deleteEventName, timeout, id: nodes[3] }],
                        "sweep ready event not generated as expected",
                    );
                } else {
                    mockLogger.assertMatchNone([{ eventName: deleteEventName }], "Should not have any delete events logged");
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
                if (expectDeleteLogs) {
                    mockLogger.assertMatch(
                        [{ eventName: deleteEventName, timeout, id: nodes[3] }],
                        "sweep ready event not generated as expected",
                    );
                } else {
                    mockLogger.assertMatchNone([{ eventName: deleteEventName }], "Should not have any delete events logged");
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
                 if (expectDeleteLogs) {
                    mockLogger.assertMatch(
                        [
                            { eventName: deleteEventName, timeout, id: nodes[1] },
                            { eventName: deleteEventName, timeout, id: nodes[2] },
                            { eventName: deleteEventName, timeout, id: nodes[3] },
                        ],
                        "sweep ready event not generated as expected",
                    );
                } else {
                    mockLogger.assertMatchNone([{ eventName: deleteEventName }], "Should not have any delete events logged");
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

        describe("Inactive events (summarizer container)", () => {
            const inactiveTimeoutMs = 500;

            beforeEach(() => {
                injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = inactiveTimeoutMs;
            });

            summarizerContainerTests(
                inactiveTimeoutMs,
                "GarbageCollector:InactiveObject_Revived",
                "GarbageCollector:InactiveObject_Changed",
                "GarbageCollector:InactiveObject_Loaded",
            );
        });

        describe("SweepReady events (summarizer container)", () => {
            const snapshotCacheExpiryMs = 500;
            const sweepTimeoutMs = defaultSessionExpiryDurationMs + snapshotCacheExpiryMs + oneDayMs;

            beforeEach(() => {
                injectedSettings[runSessionExpiryKey] = true;
            });

            summarizerContainerTests(
                sweepTimeoutMs,
                "GarbageCollector:SweepReadyObject_Revived",
                "GarbageCollector:SweepReadyObject_Changed",
                "GarbageCollector:SweepReadyObject_Loaded",
                snapshotCacheExpiryMs,
                true, // expectDeleteLogs
            );
        });

        describe("SweepReady events - Delete log disabled (summarizer container)", () => {
            const snapshotCacheExpiryMs = 500;
            const sweepTimeoutMs = defaultSessionExpiryDurationMs + snapshotCacheExpiryMs + oneDayMs;

            beforeEach(() => {
                injectedSettings[runSessionExpiryKey] = true;
                injectedSettings[disableSweepLogKey] = true;
            });

            summarizerContainerTests(
                sweepTimeoutMs,
                "GarbageCollector:SweepReadyObject_Revived",
                "GarbageCollector:SweepReadyObject_Changed",
                "GarbageCollector:SweepReadyObject_Loaded",
                snapshotCacheExpiryMs,
                false, // expectDeleteLogs
            );
        });

        describe("Interactive Client Behavior", () => {
            function updateAllNodes(garbageCollector) {
                nodes.forEach((nodeId) => {
                    garbageCollector.nodeUpdated(nodeId, "Changed", Date.now(), testPkgPath);
                    garbageCollector.nodeUpdated(nodeId, "Loaded", Date.now(), testPkgPath);
                });
            }

            async function interactiveClientTestCode(
                timeout: number,
                loadedEventName: string,
                sweepReadyUsageErrorExpected: boolean,
                snapshotCacheExpiryMs?: number,
            ) {
                let lastCloseErrorType: string = "N/A";

                // Create GC state where node 3's unreferenced time was > timeout ms ago.
                // This is important since we shouldn't run GC on the interactive container,
                // but rather load from a snapshot in which SweepReady state is already reached.

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
                const unrefTime = Date.now() - (timeout + 100);
                const node3Data: IGarbageCollectionNodeData = {
                    outboundRoutes: [],
                    unreferencedTimestampMs: unrefTime,
                };
                gcState.gcNodes[nodes[3]] = node3Data;

                const gcBlobMap: Map<string, IGarbageCollectionState> = new Map([[gcBlobId, gcState]]);
                const garbageCollector = createGarbageCollector(
                    { baseSnapshot, snapshotCacheExpiryMs },
                    gcBlobMap,
                    (error) => { lastCloseErrorType = error?.errorType ?? "NONE"; },
                    false /* isSummarizerClient */,
                );

                // Trigger loading GC data from base snapshot - but don't call GC since that's not what happens in real flow
                await (garbageCollector as any).initializeBaseStateP;

                // Update nodes and validate that all events for node 3 are logged.
                updateAllNodes(garbageCollector);
                assert(!mockLogger.events.some((event) => event.eventName !== loadedEventName && event.unrefTime === unrefTime), "shouldn't see any unreference events besides Loaded");
                mockLogger.assertMatch([{ eventName: loadedEventName, timeout, id: nodes[3], pkg: eventPkg, unrefTime }], "all events not generated as expected");

                const expectedErrorType = sweepReadyUsageErrorExpected ? "unreferencedObjectUsedAfterGarbageCollected" : "N/A";
                assert.equal(lastCloseErrorType, expectedErrorType, "Incorrect lastCloseReason after using unreferenced nodes");
            }

            beforeEach(() => {
                injectedSettings[runSessionExpiryKey] = true;
            });

            it("Inactive object used - generates events but does not close container (SweepReadyUsageDetection enabled)", async () => {
                const inactiveTimeoutMs = 400;
                injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = inactiveTimeoutMs;
                injectedSettings[SweepReadyUsageDetectionKey] = "interactiveClient";

                await interactiveClientTestCode(
                    inactiveTimeoutMs,
                    "GarbageCollector:InactiveObject_Loaded",
                    false,
                );
            });

            it("SweepReady object used - generates events and closes container (SweepReadyUsageDetection enabled)", async () => {
                const snapshotCacheExpiryMs = 500;
                const sweepTimeoutMs = defaultSessionExpiryDurationMs + snapshotCacheExpiryMs + oneDayMs;
                injectedSettings[SweepReadyUsageDetectionKey] = "interactiveClient";

                await interactiveClientTestCode(
                    sweepTimeoutMs,
                    "GarbageCollector:SweepReadyObject_Loaded",
                    true,
                    snapshotCacheExpiryMs,
                );
            });

            it("SweepReady object used - generates events but does not close container (SweepReadyUsageDetection disabled)", async () => {
                const snapshotCacheExpiryMs = 500;
                const sweepTimeoutMs = defaultSessionExpiryDurationMs + snapshotCacheExpiryMs + oneDayMs;
                injectedSettings[SweepReadyUsageDetectionKey] = "something else";

                await interactiveClientTestCode(
                    sweepTimeoutMs,
                    "GarbageCollector:SweepReadyObject_Loaded",
                    false,
                    snapshotCacheExpiryMs,
                );
            });
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
