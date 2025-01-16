/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import { IErrorBase, ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import { Timer } from "@fluidframework/core-utils/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	IGarbageCollectionDetailsBase,
	ISummarizeResult,
	channelsTreeName,
	gcBlobPrefix,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	gcTreeKey,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions/internal";
import {
	MockLogger,
	MonitoringContext,
	createChildLogger,
	mixinMonitoringContext,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils/internal";
import { SinonFakeTimers, spy, useFakeTimers } from "sinon";

import {
	GCNodeType,
	GCSummaryStateTracker,
	GCTelemetryTracker,
	GCVersion,
	GarbageCollectionMessage,
	GarbageCollectionMessageType,
	GarbageCollector,
	IGCMetadata,
	IGCStats,
	IGCSummaryTrackingData,
	IGarbageCollectionNodeData,
	IGarbageCollectionRuntime,
	IGarbageCollectionSnapshotData,
	IGarbageCollectionState,
	IGarbageCollectionSummaryDetailsLegacy,
	IGarbageCollector,
	IGarbageCollectorConfigs,
	IGarbageCollectorCreateParams,
	UnreferencedState,
	UnreferencedStateTracker,
	concatGarbageCollectionStates,
	defaultSessionExpiryDurationMs,
	defaultSweepGracePeriodMs,
	oneDayMs,
	stableGCVersion,
} from "../../gc/index.js";
import { ContainerMessageType, ContainerRuntimeGCMessage } from "../../messageTypes.js";
import { pkgVersion } from "../../packageVersion.js";
import {
	IContainerRuntimeMetadata,
	dataStoreAttributesBlobName,
	metadataBlobName,
} from "../../summary/index.js";

import { createTestConfigProvider } from "./gcUnitTestHelpers.js";

type WithPrivates<T, TPrivates> = Omit<T, keyof TPrivates> & TPrivates;

type GcWithPrivates = IGarbageCollector & {
	readonly runtime: IGarbageCollectionRuntime;
	readonly configs: IGarbageCollectorConfigs;
	readonly gcDataFromLastRun: IGarbageCollectionData | undefined;
	readonly summaryStateTracker: WithPrivates<
		GCSummaryStateTracker,
		{
			latestSummaryGCVersion: GCVersion;
			latestSummaryData: IGCSummaryTrackingData | undefined;
		}
	>;
	readonly autoRecovery: {
		useFullGC: () => boolean;
	};
	readonly telemetryTracker: GCTelemetryTracker;
	readonly mc: MonitoringContext;
	readonly sessionExpiryTimer: Omit<Timer, "defaultTimeout"> & { defaultTimeout: number };
	readonly baseSnapshotDataP: Promise<IGarbageCollectionSnapshotData | undefined>;
	readonly tombstones: string[];
	readonly deletedNodes: Set<string>;
	readonly unreferencedNodesState: Map<string, UnreferencedStateTracker>;
	readonly submitMessage: (message: ContainerRuntimeGCMessage) => void;
	readonly triggerAutoRecovery: (nodePath: string) => void;
	runGC: (fullGC: boolean) => Promise<IGCStats>;
};

describe("Garbage Collection Tests", () => {
	const defaultSnapshotCacheExpiryMs = 5 * 24 * 60 * 60 * 1000;
	const defaultTombstoneTimeoutMs =
		defaultSessionExpiryDurationMs + defaultSnapshotCacheExpiryMs + oneDayMs;
	// Nodes in the reference graph.
	const nodes: string[] = ["/node1", "/node2", "/node3", "/node4", "/node5", "/node6"];
	const testPkgPath = ["testPkg"];
	const configProvider = createTestConfigProvider();

	let mockLogger: MockLogger;
	let mc: MonitoringContext<MockLogger>;
	let clock: SinonFakeTimers;

	// The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
	let defaultGCData: IGarbageCollectionData = { gcNodes: {} };

	// Returns a dummy snapshot tree to be built upon.
	const getDummySnapshotTree = (): ISnapshotTree => {
		return {
			blobs: {},
			trees: {},
		};
	};

	/**
	 * Called when sweep runs. It deleted the nodes from defaultGCData.
	 */
	function deleteSweepReadyNodes(sweepReadyRoutes: string[]): string[] {
		for (const nodeId of sweepReadyRoutes) {
			assert(
				defaultGCData.gcNodes[nodeId] !== undefined,
				`Deleted node ${nodeId} doesn't exist`,
			);
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete defaultGCData.gcNodes[nodeId];
		}
		return sweepReadyRoutes;
	}

	/**
	 * More concise signature for calling {@link IGarbageCollector.nodeUpdated}.
	 */
	function nodeUpdated(
		garbageCollector: IGarbageCollector,
		path: string,
		reason: "Loaded" | "Changed",
		timestampMs?: number,
		packagePath?: readonly string[],
	) {
		garbageCollector.nodeUpdated({
			node: { type: "DataStore", path },
			reason,
			timestampMs,
			packagePath,
		});
	}

	function createGarbageCollector(
		params: {
			createParams?: Partial<IGarbageCollectorCreateParams>;
			gcBlobsMap?: Map<string, unknown>;
			gcMetadata?: IGCMetadata;
			closeFn?: (error?: ICriticalContainerError) => void;
			isSummarizerClient?: boolean;
			getGCData?: (fullGC?: boolean) => Promise<IGarbageCollectionData>;
		} = {},
	): GcWithPrivates {
		const {
			createParams = {},
			gcBlobsMap = new Map(),
			gcMetadata = {},
			closeFn = () => {},
			isSummarizerClient = true,
			getGCData = async () => defaultGCData,
		} = params;

		const getNodeType = (nodePath: string) => {
			if (nodePath.split("/").length !== 2) {
				return GCNodeType.Other;
			}
			return GCNodeType.DataStore;
		};

		// The runtime to be passed to the garbage collector.
		const gcRuntime: IGarbageCollectionRuntime = {
			getGCData,
			updateUsedRoutes: (usedRoutes: string[]) => {
				return { totalNodeCount: 0, unusedNodeCount: 0 };
			},
			deleteSweepReadyNodes,
			updateTombstonedRoutes: (tombstoneRoutes: string[]) => {},
			getNodeType,
			getCurrentReferenceTimestampMs: () => Date.now(),
			closeFn,
		};

		let metadata = createParams.metadata;
		const existing = createParams.baseSnapshot !== undefined;
		// For existing, add container runtime metadata which is required for GC to be enabled.
		if (existing) {
			metadata = {
				...metadata,
				...gcMetadata,
				gcFeature: gcMetadata.gcFeature ?? stableGCVersion,
				summaryFormatVersion: 1,
				message: undefined,
			};
		}

		return GarbageCollector.create({
			...createParams,
			runtime: gcRuntime,
			gcOptions: createParams.gcOptions ?? {},
			baseSnapshot: createParams.baseSnapshot,
			baseLogger: createChildLogger({ logger: mc.logger }),
			existing,
			metadata,
			createContainerMetadata: {
				createContainerRuntimeVersion: pkgVersion,
				createContainerTimestamp: Date.now(),
			},
			isSummarizerClient,
			readAndParseBlob: async <T>(id: string) => gcBlobsMap.get(id) as T,
			getNodePackagePath: async (nodeId: string) => testPkgPath,
			getLastSummaryTimestampMs: () => Date.now(),
			submitMessage: (message: ContainerRuntimeGCMessage) => {},
			sessionExpiryTimerStarted: createParams.sessionExpiryTimerStarted,
		}) as GcWithPrivates;
	}
	let gc: GcWithPrivates | undefined;

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		gc = undefined;
		mockLogger = new MockLogger();
		mc = mixinMonitoringContext(mockLogger, configProvider);
	});

	afterEach(() => {
		clock.reset();
		mockLogger.clear();
		configProvider.clear();
		defaultGCData = { gcNodes: {} };
		gc?.dispose();
	});

	after(() => {
		clock.restore();
	});

	describe("Session expiry", () => {
		it("Session expiry closes container", () => {
			let closeCalled = false;
			function closeCalledAfterExactTicks(ticks: number) {
				clock.tick(ticks - 1);
				if (closeCalled) {
					return false;
				}
				clock.tick(1);
				return closeCalled;
			}

			gc = createGarbageCollector({
				closeFn: () => {
					closeCalled = true;
				},
			});
			assert(
				closeCalledAfterExactTicks(defaultSessionExpiryDurationMs),
				"Close should have been called at exactly defaultSessionExpiryDurationMs",
			);
		});

		it("Session expiry is adjusted by sessionExpiryTimerStarted", () => {
			let closeCalled = false;
			const sessionExpiryTimerStarted = defaultSessionExpiryDurationMs - 1; // arbitrary number
			clock.tick(sessionExpiryTimerStarted + defaultSessionExpiryDurationMs - 1);
			gc = createGarbageCollector({
				createParams: { sessionExpiryTimerStarted },
				closeFn: () => {
					closeCalled = true;
				},
			});
			assert(closeCalled === false, "Close should not have been called");
			clock.tick(1);
			assert(closeCalled, "Close should have been called");
		});

		it("it throws when already expired", () => {
			clock.tick(defaultSessionExpiryDurationMs + 1);
			assert.throws(() =>
				createGarbageCollector({
					createParams: { sessionExpiryTimerStarted: 1 },
					closeFn: () => {
						throw new Error("Session expired");
					},
				}),
			);
		});
	});

	describe("addedOutboundReference", () => {
		it("ignores target relative URLs", () => {
			const garbageCollector = createGarbageCollector();
			const spies = {
				telemetryTracker: { nodeUsed: spy(garbageCollector.telemetryTracker, "nodeUsed") },
			};
			garbageCollector.addedOutboundReference("/from", "to/relative/url", Date.now());
			mockLogger.assertMatch(
				[{ eventName: "GarbageCollector:InvalidRelativeOutboundRoute", category: "error" }],
				"Expected error log",
			);
			assert.equal(
				spies.telemetryTracker.nodeUsed.callCount,
				0,
				"nodeUsed should not be called",
			);
		});
		it("tracks target absolute URLs", () => {
			const garbageCollector = createGarbageCollector();
			const spies = {
				telemetryTracker: { nodeUsed: spy(garbageCollector.telemetryTracker, "nodeUsed") },
			};
			garbageCollector.addedOutboundReference("/from", "/to/absolute/url", Date.now());
			mockLogger.assertMatchNone(
				[{ eventName: "GarbageCollector:InvalidRelativeOutboundRoute" }],
				"unexpected events logged",
			);
			assert.equal(
				spies.telemetryTracker.nodeUsed.callCount,
				1,
				"nodeUsed should have been called",
			);
		});
	});

	it("Private Autorecovery API", () => {
		const autoRecovery: {
			useFullGC: () => boolean;
			requestFullGCOnNextRun: () => void;
			onCompletedGCRun: () => void;
			onSummaryAck: () => void;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} = createGarbageCollector().autoRecovery as any;

		assert.equal(autoRecovery.useFullGC(), false, "Expect false by default");

		autoRecovery.requestFullGCOnNextRun();
		assert.equal(autoRecovery.useFullGC(), true, "Expect true after requesting full GC");

		autoRecovery.onSummaryAck();
		assert.equal(autoRecovery.useFullGC(), true, "Expect true still after early Summary Ack");

		autoRecovery.onCompletedGCRun();
		assert.equal(autoRecovery.useFullGC(), true, "Expect true still after full GC alone");

		autoRecovery.onSummaryAck();
		assert.equal(autoRecovery.useFullGC(), false, "Expect false after post-GC Summary Ack");
	});

	describe("Tombstone and Sweep", () => {
		it("Tombstone then Delete", async () => {
			// Simple starting reference graph - root and two nodes
			defaultGCData.gcNodes["/"] = [nodes[0], nodes[1]];
			defaultGCData.gcNodes[nodes[0]] = [];
			defaultGCData.gcNodes[nodes[1]] = [];

			// Sweep enabled
			gc = createGarbageCollector({ createParams: { gcOptions: { enableGCSweep: true } } });
			// These spies will let us monitor how each of these functions are called (or not) during runSweepPhase.
			// The original behavior of the function is preserved, but we can check how it was called.
			const spies = {
				updateTombstonedRoutes: spy(gc.runtime, "updateTombstonedRoutes"),
				submitMessage: spy(gc, "submitMessage"),
			};

			// Nodes 0 and 1 are referenced
			await gc.collectGarbage({});

			// Unreference 0
			defaultGCData.gcNodes["/"] = [nodes[1]];
			clock.tick(10);
			await gc.collectGarbage({});

			// Erase the spy's tracking of calls up to this point - I just want to observe what happens next.
			spies.updateTombstonedRoutes.resetHistory();

			// Skip to TombstoneReady state
			clock.tick(defaultTombstoneTimeoutMs);
			await gc.collectGarbage({});

			assert(
				spies.updateTombstonedRoutes.calledWith([nodes[0]]),
				"updateTombstonedRoutes should be called with node 0",
			);
			assert.equal(
				spies.submitMessage.callCount,
				0,
				"submitMessage should not be called yet, didn't pass Grace Period yet",
			);
			spies.updateTombstonedRoutes.resetHistory();

			// Skip past Sweep Grace Period. GC Sweep op should be submitted
			clock.tick(defaultSweepGracePeriodMs);
			await gc.collectGarbage({});

			assert.equal(
				spies.submitMessage.callCount,
				1,
				"submitMessage should be called since Sweep is enabled",
			);
			assert(
				spies.updateTombstonedRoutes.alwaysCalledWith([]),
				"No additional nodes should be Tombstoned",
			);
		});

		it("Sweep Disabled - Should Tombstone SweepReady nodes", async () => {
			defaultGCData.gcNodes["/"] = [nodes[0], nodes[1]];
			defaultGCData.gcNodes[nodes[0]] = [];
			defaultGCData.gcNodes[nodes[1]] = [];

			gc = createGarbageCollector();
			const spies = {
				updateTombstonedRoutes: spy(gc.runtime, "updateTombstonedRoutes"),
				submitMessage: spy(gc, "submitMessage"),
			};

			// Nodes 0 and 1 are referenced
			await gc.collectGarbage({});

			// Unreference 0
			defaultGCData.gcNodes["/"] = [nodes[1]];
			clock.tick(10);
			await gc.collectGarbage({});

			// Skip all the way past Sweep Grace Period.  But Sweep is disabled, so Tombstone should happen
			clock.tick(defaultTombstoneTimeoutMs + defaultSweepGracePeriodMs);
			assert.equal(
				gc.unreferencedNodesState.get(nodes[0])?.state,
				"SweepReady",
				"Node 0 should be SweepReady (not TombstoneReady)",
			);

			spies.updateTombstonedRoutes.resetHistory();
			await gc.collectGarbage({});

			assert(
				spies.updateTombstonedRoutes.calledWith([nodes[0]]),
				"updateTombstonedRoutes should be called with node 0",
			);
			assert.equal(
				spies.submitMessage.callCount,
				0,
				"submitMessage should not be called since Sweep is disabled",
			);
		});

		it("Autorecovery upon loading a Tombstoned node", async () => {
			// Simple starting reference graph - root and two nodes
			defaultGCData.gcNodes["/"] = [nodes[0], nodes[1]];
			defaultGCData.gcNodes[nodes[0]] = [];
			defaultGCData.gcNodes[nodes[1]] = [];

			// Simulate GC Data with a route missing (nodes[0] is referenced but missing here)
			// We'll return this from getGCData unless fullGC is passed in.
			const corruptedGCData: IGarbageCollectionData = JSON.parse(
				JSON.stringify(defaultGCData),
			);
			corruptedGCData.gcNodes["/"] = [nodes[1]];

			// getGCData set up to return the corrupted data unless fullGC is true
			gc = createGarbageCollector({
				createParams: { gcOptions: { enableGCSweep: true } }, // Required to run AutoRecovery
				getGCData: async (fullGC?: boolean) => {
					return fullGC ? defaultGCData : corruptedGCData;
				},
			});

			// These spies will let us monitor how each of these functions are called (or not) during runSweepPhase.
			// The original behavior of the function is preserved, but we can check how it was called.
			const spies = {
				gc: {
					submitMessage: spy(gc, "submitMessage"),
					addedOutboundReference: spy(gc, "addedOutboundReference"),
					runGC: spy(gc, "runGC"),
				},
			};

			// Nodes 0 and 1 are referenced (use correct gcData via fullGC true)
			// Simulate successful summary ack to clear doesGCStateNeedReset flag so it doesn't interfere (it leads to fullGC too)
			await gc.collectGarbage({ fullGC: true });
			await gc.summaryStateTracker.refreshLatestSummary({
				isSummaryTracked: true,
				isSummaryNewer: false,
			});
			assert(
				!gc.unreferencedNodesState.has(nodes[0]),
				"node 0 should not be unreferenced to start",
			);

			// Now run GC again - this time with the corrupted data (via fullGC false)
			clock.tick(10);
			await gc.collectGarbage({ fullGC: false });
			assert.equal(
				gc.unreferencedNodesState.get(nodes[0])?.state,
				UnreferencedState.Active, // This means recently unreferenced
				"node 0 should appear unreferenced after running GC with corrupted GC Data",
			);

			// Let node 0 become Tombstoned and verify it
			clock.tick(defaultTombstoneTimeoutMs);
			await gc.collectGarbage({});
			assert.equal(
				gc.unreferencedNodesState.get(nodes[0])?.state,
				UnreferencedState.TombstoneReady,
				"node 0 should be TombstoneReady",
			);
			assert.deepEqual(gc.tombstones, [nodes[0]], "node 0 should be in the Tombstones list");

			// Simulate usage to trigger TombstoneLoaded op.
			nodeUpdated(gc, nodes[0], "Loaded", Date.now());
			const [gcTombstoneLoadedMessage] = spies.gc.submitMessage.args[0];
			assert.deepEqual(
				gcTombstoneLoadedMessage,
				{
					type: ContainerMessageType.GC,
					contents: {
						type: GarbageCollectionMessageType.TombstoneLoaded,
						nodePath: nodes[0],
					},
				} satisfies ContainerRuntimeGCMessage,
				"submitted message not as expected",
			);

			const autoRecoveryTimestampMs = Date.now();
			// Plumb the message to processMessage fn to trigger autorecovery
			// Autorecovery: addedOutboundReference should be called with the tombstoned node, which should transition to "Active" state
			gc.processMessages(
				[gcTombstoneLoadedMessage.contents],
				autoRecoveryTimestampMs,
				true /* local */,
			);
			assert.deepEqual(
				spies.gc.addedOutboundReference.args[0],
				["/", nodes[0], autoRecoveryTimestampMs, /* autorecovery: */ true],
				"addedOutboundReference should be called with node 0",
			);
			assert.equal(
				gc.unreferencedNodesState.get(nodes[0])?.state,
				UnreferencedState.Active,
				"node 0 should be unreferenced but 'Active' after initial Autorecovery moment (it was TombstoneReady)",
			);

			// Simulate a successful GC/Summary.
			// GC Data corruption should be fixed (nodes[0] should be referenced again) and autorecovery fullGC state should be reset
			spies.gc.runGC.resetHistory();
			// BUG FIX: Start with a spurious summary ack arriving before GC runs. It should not yet reset the autoRecovery state.
			await gc.refreshLatestSummary({
				isSummaryTracked: true,
				isSummaryNewer: false,
			});
			assert(
				gc.autoRecovery.useFullGC(),
				"autoRecovery.useFullGC should still be true after spurious summary ack (haven't run GC yet)",
			);
			await gc.collectGarbage({});
			assert(
				spies.gc.runGC.calledWith(/* fullGC: */ true),
				"runGC should be called with fullGC true",
			);
			// This matters in case GC runs but the summary fails. We'll need to run with fullGC again next time.
			assert(
				gc.autoRecovery.useFullGC(),
				"autoRecovery.useFullGC should still be true after GC run but before summary ack",
			);
			await gc.refreshLatestSummary({
				isSummaryTracked: true,
				isSummaryNewer: false,
			});
			assert(
				!gc.autoRecovery.useFullGC(),
				"autoRecovery.useFullGC should have been reset to false now",
			);

			// Lastly, confirm that the node was successfully restored
			// (not actually that interesting since we're hardcoding the GC Data, but still)
			assert(
				!gc.unreferencedNodesState.has(nodes[0]),
				"node 0 should not be unreferenced after repairing GC Data",
			);
		});
	});

	describe("errors when unreferenced objects are used after they are inactive / deleted", () => {
		// Mock node loaded and changed activity for all the nodes in the graph.
		async function mockNodeChangesAndRunGC(garbageCollector: IGarbageCollector) {
			nodes.forEach((nodeId) => {
				nodeUpdated(garbageCollector, nodeId, "Loaded", Date.now(), testPkgPath);
				nodeUpdated(garbageCollector, nodeId, "Changed", Date.now(), testPkgPath);
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

		const summarizerContainerTests = (
			timeout: number,
			mode: "inactive" | "tombstone" | "sweep",
			revivedEventName: string,
			changedEventName: string,
			loadedEventName: string,
			sweepGracePeriodMsOverride?: number,
		) => {
			// Validates that no unexpected event has been fired.
			function validateNoEvents() {
				mockLogger.assertMatchNone(
					[
						{ eventName: revivedEventName },
						{ eventName: changedEventName },
						{ eventName: loadedEventName },
					],
					"unexpected events logged",
				);
			}

			const sweepGracePeriodMs = sweepGracePeriodMsOverride ?? defaultSweepGracePeriodMs;

			const createGCOverride = (
				baseSnapshot?: ISnapshotTree,
				gcBlobsMap?: Map<string, IGarbageCollectionState | IGarbageCollectionDetailsBase>,
			) => {
				const tombstoneTimeoutMs =
					mode === "tombstone"
						? timeout
						: mode === "sweep"
							? timeout - sweepGracePeriodMs
							: undefined;
				const gcOptions = { sweepGracePeriodMs };
				return createGarbageCollector({
					createParams: { baseSnapshot, gcOptions },
					gcBlobsMap,
					gcMetadata: {
						tombstoneTimeoutMs,
					},
				});
			};

			it("doesn't generate events for referenced nodes", async () => {
				const garbageCollector = createGCOverride();

				// Run garbage collection on the default GC data where everything is referenced.
				await garbageCollector.collectGarbage({});

				// Advance the clock just before the timeout and validate no events are generated.
				clock.tick(timeout - 1);
				await mockNodeChangesAndRunGC(garbageCollector);
				validateNoEvents();

				// Advance the clock to expire the timeout.
				clock.tick(1);

				// Update all nodes again. Validate that no unexpected events are generated since everything is referenced.
				await mockNodeChangesAndRunGC(garbageCollector);
				validateNoEvents();
			});

			it("generates events for nodes that are used after time out", async () => {
				const garbageCollector = createGCOverride();

				// Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
				defaultGCData.gcNodes[nodes[1]] = [];

				await garbageCollector.collectGarbage({});

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				await mockNodeChangesAndRunGC(garbageCollector);
				validateNoEvents();

				// Expire the timeout and validate that all events for node 2 and node 3 are logged.
				clock.tick(1);
				await mockNodeChangesAndRunGC(garbageCollector);
				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				expectedEvents.push(
					{
						eventName: loadedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[2], pkg: testPkgPath.join("/") }),
						createContainerRuntimeVersion: pkgVersion,
					},
					{
						eventName: changedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[2], pkg: testPkgPath.join("/") }),
						createContainerRuntimeVersion: pkgVersion,
					},
					{
						eventName: loadedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						createContainerRuntimeVersion: pkgVersion,
					},
					{
						eventName: changedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						createContainerRuntimeVersion: pkgVersion,
					},
				);
				mockLogger.assertMatch(
					expectedEvents,
					"all events not generated as expected",
					true /* inlineDetailsProp */,
				);

				// Add reference from node 1 to node 3 and validate that we get a revived event.
				garbageCollector.addedOutboundReference(nodes[1], nodes[3], Date.now());
				await garbageCollector.collectGarbage({});
				mockLogger.assertMatch(
					[
						{
							eventName: revivedEventName,
							timeout,
							...tagCodeArtifacts({
								id: nodes[3],
								fromId: nodes[1],
								pkg: testPkgPath.join("/"),
							}),
						},
					],
					"revived event not generated as expected",
					true /* inlineDetailsProp */,
				);
			});

			it("generates only revived event when an inactive node is changed and revived", async () => {
				const garbageCollector = createGCOverride();

				// Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
				defaultGCData.gcNodes[nodes[1]] = [];

				await garbageCollector.collectGarbage({});

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				await mockNodeChangesAndRunGC(garbageCollector);
				validateNoEvents();

				// Expire the timeout and validate that only revived event is generated for node 2.
				clock.tick(1);
				nodeUpdated(garbageCollector, nodes[2], "Changed", Date.now(), testPkgPath);
				nodeUpdated(garbageCollector, nodes[2], "Loaded", Date.now(), testPkgPath);
				garbageCollector.addedOutboundReference(nodes[1], nodes[2], Date.now());
				await garbageCollector.collectGarbage({});

				for (const event of mockLogger.events) {
					assert.notStrictEqual(
						event.eventName,
						loadedEventName,
						"Unexpected loaded event logged",
					);
					assert.notStrictEqual(
						event.eventName,
						changedEventName,
						"Unexpected changed event logged",
					);
				}
				mockLogger.assertMatch(
					[
						{
							eventName: revivedEventName,
							timeout,
							...tagCodeArtifacts({
								id: nodes[2],
								fromId: nodes[1],
								pkg: testPkgPath.join("/"),
							}),
						},
					],
					"revived event not logged as expected",
					true /* inlineDetailsProp */,
				);
			});

			it("generates events once per node", async () => {
				const garbageCollector = createGCOverride();

				// Remove node 3's reference from node 2.
				defaultGCData.gcNodes[nodes[2]] = [];

				await garbageCollector.collectGarbage({});

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				await mockNodeChangesAndRunGC(garbageCollector);
				validateNoEvents();

				// Expire the timeout and validate that all events for node 2 and node 3 are logged.
				clock.tick(1);
				await mockNodeChangesAndRunGC(garbageCollector);
				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				expectedEvents.push(
					{
						eventName: loadedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
					},
					{
						eventName: changedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
					},
				);
				mockLogger.assertMatch(
					expectedEvents,
					"all events not generated as expected",
					true /* inlineDetailsProp */,
				);

				// Update all nodes again. There shouldn't be any more events since for each node the event is only once.
				await mockNodeChangesAndRunGC(garbageCollector);
				validateNoEvents();
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
				// Validate that all events are logged as expected.
				nodeUpdated(garbageCollector, nodes[3], "Loaded", Date.now(), testPkgPath);
				nodeUpdated(garbageCollector, nodes[3], "Changed", Date.now(), testPkgPath);
				await garbageCollector.collectGarbage({});
				mockLogger.assertMatch(
					[
						{
							eventName: loadedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						},
						{
							eventName: changedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						},
					],
					"all events not generated as expected",
					true /* inlineDetailsProp */,
				);

				// Add reference from node 2 to node 3 and validate that revived event is logged.
				defaultGCData.gcNodes[nodes[2]] = [nodes[3]];
				garbageCollector.addedOutboundReference(nodes[2], nodes[3], Date.now());
				await garbageCollector.collectGarbage({});
				mockLogger.assertMatch(
					[
						{
							eventName: revivedEventName,
							timeout,
							...tagCodeArtifacts({
								id: nodes[3],
								fromId: nodes[2],
								pkg: testPkgPath.join("/"),
							}),
						},
					],
					"revived event not generated as expected",
					true /* inlineDetailsProp */,
				);
			});

			/**
			 * Here, the base snapshot contains nodes that have timed out. The test validates that we generate errors
			 * when these nodes are used via trailing ops. It simulates trailing ops by calling `nodeUsed` (called when
			 * ops are processed) before initializing garbage collector.
			 */
			it("generates events for nodes that time out on load - nodes are used via trailing ops", async () => {
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

				// Initialize the base state which happens during runtime initialization.
				await garbageCollector.initializeBaseState();

				// Simulate sending op and loading the node in unreferenced state.
				nodeUpdated(garbageCollector, nodes[3], "Loaded", Date.now(), testPkgPath);
				nodeUpdated(garbageCollector, nodes[3], "Changed", Date.now(), testPkgPath);

				// Log pending events explicitly. This is needed because summarizer clients don't log these events
				// until the next GC run which calls this function.
				await garbageCollector.telemetryTracker.logPendingEvents(garbageCollector.mc.logger);
				mockLogger.assertMatch(
					[
						{
							eventName: loadedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						},
						{
							eventName: changedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						},
					],
					"all events not generated as expected",
					true /* inlineDetailsProp */,
				);

				// Add reference from node 2 to node 3 and validate that revived event is logged. Node 3 needs to be
				// deleted from unreferencedNodesState otherwise revived events are not logged.
				garbageCollector.addedOutboundReference(nodes[2], nodes[3], Date.now());
				garbageCollector.unreferencedNodesState.delete(nodes[3]);
				await garbageCollector.telemetryTracker.logPendingEvents(garbageCollector.mc.logger);
				mockLogger.assertMatch(
					[
						{
							eventName: revivedEventName,
							timeout,
							...tagCodeArtifacts({
								id: nodes[3],
								fromId: nodes[2],
								pkg: testPkgPath.join("/"),
							}),
						},
					],
					"revived event not generated as expected",
					true /* inlineDetailsProp */,
				);
			});

			/**
			 * Here, the base snapshot contains nodes that have timed out and the GC blob in snapshot is in old format. The
			 * test validates that we generate errors when these nodes are used.
			 */
			it("generates events for nodes that time out on load - old snapshot format", async () => {
				// Create GC details for node 3's GC blob whose unreferenced time was > timeout ms ago.
				// This means this node should time out as soon as its data is loaded.
				const node3GCDetails: IGarbageCollectionSummaryDetailsLegacy = {
					gcData: { gcNodes: { "/": [] } },
					unrefTimestamp: Date.now() - (timeout + 100),
				};
				const node3Snapshot = getDummySnapshotTree();
				const gcBlobId = "node3GCDetails";
				const attributesBlobId = "attributesBlob";
				node3Snapshot.blobs[gcTreeKey] = gcBlobId;
				node3Snapshot.blobs[dataStoreAttributesBlobName] = attributesBlobId;

				// Create a base snapshot that contains snapshot tree of node 3.
				const channelsTree = getDummySnapshotTree();
				channelsTree.trees[nodes[3].slice(1)] = node3Snapshot;
				const baseSnapshot = getDummySnapshotTree();
				baseSnapshot.trees[channelsTreeName] = channelsTree;

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

				// Validate that no events are generated since none of the timeouts have passed
				nodeUpdated(garbageCollector, nodes[3], "Loaded", Date.now(), testPkgPath);
				nodeUpdated(garbageCollector, nodes[3], "Changed", Date.now(), testPkgPath);
				await garbageCollector.collectGarbage({});
				mockLogger.assertMatchNone(
					[
						{
							eventName: loadedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						},
						{
							eventName: changedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						},
					],
					"all events not generated as expected",
					true /* inlineDetailsProp */,
				);

				// No revived events should be logged as no timeouts should have occurred
				garbageCollector.addedOutboundReference(nodes[2], nodes[3], Date.now());
				await garbageCollector.collectGarbage({});
				mockLogger.assertMatchNone(
					[
						{
							eventName: revivedEventName,
							timeout,
							...tagCodeArtifacts({
								id: nodes[3],
								fromId: nodes[2],
								pkg: testPkgPath.join("/"),
							}),
						},
					],
					"revived event not generated as expected",
					true /* inlineDetailsProp */,
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
				blob1GCState.gcNodes[nodes[1]] = {
					outboundRoutes: [],
					unreferencedTimestampMs: expiredTimestampMs,
				};
				gcBlobMap.set(blob1Id, blob1GCState);

				const blob2Id = "blob2";
				const blob2GCState: IGarbageCollectionState = { gcNodes: {} };
				blob2GCState.gcNodes[nodes[2]] = {
					outboundRoutes: [],
					unreferencedTimestampMs: expiredTimestampMs,
				};
				gcBlobMap.set(blob2Id, blob2GCState);

				const blob3Id = "blob3";
				const blob3GCState: IGarbageCollectionState = { gcNodes: {} };
				blob3GCState.gcNodes[nodes[3]] = {
					outboundRoutes: [],
					unreferencedTimestampMs: expiredTimestampMs,
				};
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

				// Validate that all events are logged as expected.
				nodeUpdated(garbageCollector, nodes[3], "Loaded", Date.now(), testPkgPath);
				nodeUpdated(garbageCollector, nodes[1], "Changed", Date.now(), testPkgPath);
				nodeUpdated(garbageCollector, nodes[2], "Changed", Date.now(), testPkgPath);
				await garbageCollector.collectGarbage({});
				mockLogger.assertMatch(
					[
						{
							eventName: loadedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[3], pkg: testPkgPath.join("/") }),
						},
						{
							eventName: changedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[1], pkg: testPkgPath.join("/") }),
						},
						{
							eventName: changedEventName,
							timeout,
							...tagCodeArtifacts({ id: nodes[2], pkg: testPkgPath.join("/") }),
						},
					],
					"all events not generated as expected",
					true /* inlineDetailsProp */,
				);
			});
		};

		describe("Inactive events (summarizer container)", () => {
			const inactiveTimeoutMs = 500;

			beforeEach(() => {
				configProvider.set(
					"Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs",
					inactiveTimeoutMs,
				);
			});

			summarizerContainerTests(
				inactiveTimeoutMs,
				"inactive",
				"GarbageCollector:InactiveObject_Revived",
				"GarbageCollector:InactiveObject_Changed",
				"GarbageCollector:InactiveObject_Loaded",
			);
		});

		describe("TombstoneReady events (summarizer container)", () => {
			summarizerContainerTests(
				defaultTombstoneTimeoutMs,
				"tombstone",
				"GarbageCollector:TombstoneReadyObject_Revived",
				"GarbageCollector:TombstoneReadyObject_Changed",
				"GarbageCollector:TombstoneReadyObject_Loaded",
			);
		});

		describe("SweepReady events - No sweepGracePeriodMs (summarizer container)", () => {
			summarizerContainerTests(
				defaultTombstoneTimeoutMs,
				"sweep", // Jump straight to SweepReady given 0 delay
				"GarbageCollector:SweepReadyObject_Revived",
				"GarbageCollector:SweepReadyObject_Changed",
				"GarbageCollector:SweepReadyObject_Loaded",
				0 /* sweepGracePeriodMsOverride */,
			);
		});

		describe("SweepReady events - with sweepGracePeriodMs delay (summarizer container)", () => {
			summarizerContainerTests(
				defaultTombstoneTimeoutMs + defaultSweepGracePeriodMs,
				"sweep",
				"GarbageCollector:SweepReadyObject_Revived",
				"GarbageCollector:SweepReadyObject_Changed",
				"GarbageCollector:SweepReadyObject_Loaded",
			);
		});

		describe("Base GC state updates", () => {
			function getSnapshotWithGCVersion(baseGCVersion: GCVersion) {
				// Create a snapshot tree to be used as the GC snapshot tree.
				const gcSnapshotTree = getDummySnapshotTree();
				const gcBlobId = "root";
				// Add a GC blob with key that start with `blob` to the GC snapshot tree. The blob Id for this
				// is generated by server in real scenarios but we use a static id here for testing.
				gcSnapshotTree.blobs[`${gcBlobPrefix}_${gcBlobId}`] = gcBlobId;

				// Create GC state with a node. This will be returned when the garbage collector asks for the GC blob
				// with `gcBlobId`.
				const gcState: IGarbageCollectionState = { gcNodes: {} };
				const nodeData: IGarbageCollectionNodeData = {
					outboundRoutes: [],
					unreferencedTimestampMs: 123,
				};
				gcState.gcNodes[nodes[0]] = nodeData;

				// Create a tombstone blob. This will be returned when the garbage collector asks for tombstone blob.
				const gcTombstoneBlobId = "tombstone";
				gcSnapshotTree.blobs[gcTombstoneBlobKey] = gcTombstoneBlobId;
				const tombstones = [nodes[0]];

				// Create a deleted nodes blob. This will be returned when the garbage collector asks for deleted
				// nodes blob.
				const gcDeletedBlobId = "deletedNodes";
				gcSnapshotTree.blobs[gcDeletedBlobKey] = gcDeletedBlobId;
				const deletedBlobs = [nodes[0]];

				// Create a snapshot that contains the GC snapshot tree.
				const snapshotTree = getDummySnapshotTree();
				snapshotTree.trees[gcTreeKey] = gcSnapshotTree;

				const metadataBlobId = "metadata";
				const metadata: IContainerRuntimeMetadata = {
					gcFeature: baseGCVersion,
					summaryFormatVersion: 1,
					message: undefined,
				};
				snapshotTree.blobs[metadataBlobName] = metadataBlobId;

				const gcBlobsMap: Map<string, unknown> = new Map();
				gcBlobsMap.set(gcBlobId, gcState);
				gcBlobsMap.set(gcTombstoneBlobId, tombstones);
				gcBlobsMap.set(gcDeletedBlobId, deletedBlobs);
				gcBlobsMap.set(metadataBlobId, metadata);

				return { snapshotTree, gcBlobsMap };
			}

			function createGCOverride(
				baseGCVersion: GCVersion,
				gcStateInBaseSnapshot: boolean = true,
			) {
				const gcMetadata: IGCMetadata = {
					gcFeature: baseGCVersion,
				};
				let snapshotTree: ISnapshotTree;
				let gcBlobsMap: Map<string, unknown> | undefined;
				if (gcStateInBaseSnapshot) {
					const snapshotWithGCState = getSnapshotWithGCVersion(baseGCVersion);
					snapshotTree = snapshotWithGCState.snapshotTree;
					gcBlobsMap = snapshotWithGCState.gcBlobsMap;
				} else {
					snapshotTree = getDummySnapshotTree();
				}
				return createGarbageCollector({
					createParams: { baseSnapshot: snapshotTree },
					gcBlobsMap,
					gcMetadata,
				});
			}

			it("reads all GC data from base snapshot when GC version does not change", async () => {
				const garbageCollector = createGCOverride(stableGCVersion);

				// GC state, tombstone state and deleted nodes should all be read from base snapshot.
				const baseSnapshotData = await garbageCollector.baseSnapshotDataP;
				assert(baseSnapshotData !== undefined, "base snapshot was not initialized correctly");
				assert(
					baseSnapshotData.gcState !== undefined,
					"GC state in base snapshot should not be available",
				);
				assert(
					baseSnapshotData.tombstones !== undefined,
					"Tombstone state in base snapshot should be available",
				);
				assert(
					baseSnapshotData.deletedNodes !== undefined,
					"Deleted nodes in base snapshot should be available",
				);

				// Initialize from the base state and validate that tombstones and deleted state both have one entry
				// as per the base snapshot.
				await garbageCollector.initializeBaseState();
				assert.strictEqual(
					garbageCollector.tombstones.length,
					1,
					"Expecting 1 tombstone node",
				);
				assert.strictEqual(garbageCollector.deletedNodes.size, 1, "Expecting 1 deleted node");
			});

			it("resets GC / tombstone state when GC version is newer that the one in base snapshot", async () => {
				// Set the GC version in base snapshot to lower than the stable GC version (current GC version).
				const garbageCollector = createGCOverride(stableGCVersion - 1);

				// GC state and tombstone state should be discarded but deleted nodes should be read from base snapshot.
				const baseSnapshotData = await garbageCollector.baseSnapshotDataP;
				assert(baseSnapshotData !== undefined, "base snapshot was not initialized correctly");
				assert(
					baseSnapshotData.gcState === undefined,
					"GC state in base snapshot should be undefined when GC version changes",
				);
				assert(
					baseSnapshotData.tombstones === undefined,
					"Tombstone state in base snapshot should be undefined when GC version changes",
				);
				assert(
					baseSnapshotData.deletedNodes !== undefined,
					"Deleted nodes in base snapshot should be available",
				);

				// Initialize from the base state and validate the following:
				// - GC data should be empty.
				// - Tombstones should have 0 entries because it is discarded.
				// - Deleted nodes should have one entry because it is still used.
				// - GC should be enabled to run.
				await garbageCollector.initializeBaseState();
				assert.strictEqual(
					garbageCollector.tombstones.length,
					0,
					"Expecting no tombstone nodes",
				);
				assert.strictEqual(garbageCollector.deletedNodes.size, 1, "Expecting 1 deleted node");
				assert.strictEqual(
					garbageCollector.configs.gcAllowed,
					true,
					"Expected GC to be enabled",
				);
			});

			it("resets GC / tombstone state when GC version is older that the one in base snapshot", async () => {
				// Set the GC version in base snapshot to higher than the stable GC version (current GC version).
				const garbageCollector = createGCOverride(stableGCVersion + 1);

				// GC state and tombstone state should be discarded but deleted nodes should be read from base snapshot.
				const baseSnapshotData = await garbageCollector.baseSnapshotDataP;
				assert(baseSnapshotData !== undefined, "base snapshot was not initialized correctly");
				assert(
					baseSnapshotData.gcState === undefined,
					"GC state in base snapshot should be undefined when GC version changes",
				);
				assert(
					baseSnapshotData.tombstones === undefined,
					"Tombstone state in base snapshot should be undefined when GC version changes",
				);
				assert(
					baseSnapshotData.deletedNodes !== undefined,
					"Deleted nodes in base snapshot should be available",
				);

				// Initialize from the base state and validate the following:
				// - GC data should be empty.
				// - Tombstones should have 0 entries because it is discarded.
				// - Deleted nodes should have one entry because it is still used.
				// - GC should be disabled to run.
				await garbageCollector.initializeBaseState();
				assert.strict(
					garbageCollector.gcDataFromLastRun === undefined,
					"Expecting no GC data",
				);
				assert.strictEqual(
					garbageCollector.tombstones.length,
					0,
					"Expecting no tombstone nodes",
				);
				assert.strictEqual(garbageCollector.deletedNodes.size, 1, "Expecting 1 deleted node");
				assert.strictEqual(
					garbageCollector.configs.gcAllowed,
					true,
					"Expected GC to be enabled",
				);
			});

			it("starts with empty GC state when there is no GC state in base snapshot", async () => {
				const garbageCollector = createGCOverride(
					stableGCVersion,
					false /* gcStateInBaseSnapshot */,
				);

				const baseSnapshotData = await garbageCollector.baseSnapshotDataP;
				assert(baseSnapshotData === undefined, "base snapshot was should not be available");

				// Initialize from the base state and validate the following:
				// - GC data should be empty.
				// - Tombstones should have 0 entries because it doesn't exist.
				// - Deleted nodes should have 0 entries because it doesn't exist.
				// - GC should be enabled to run.
				await garbageCollector.initializeBaseState();
				assert.strict(
					garbageCollector.gcDataFromLastRun === undefined,
					"Expecting no GC data",
				);
				assert.strictEqual(
					garbageCollector.tombstones.length,
					0,
					"Expecting no tombstone nodes",
				);
				assert.strictEqual(garbageCollector.deletedNodes.size, 0, "Expecting no deleted node");
				assert.strictEqual(
					garbageCollector.configs.gcAllowed,
					true,
					"Expected GC to be enabled to run",
				);
			});
		});

		it("Unreferenced nodes transition through Inactive, TombstoneReady and SweepReady states", async () => {
			const inactiveTimeoutMs = 500;
			configProvider.set(
				"Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs",
				inactiveTimeoutMs,
			);

			const garbageCollector = createGarbageCollector({});

			function validateUnreferencedStates(
				expectedUnreferencedStates: Record<number, UnreferencedState>,
			) {
				// Base assumption is that all 6 nodes are still referenced (no state tracker aka 'undefined')
				// Then update this with the given expected unreferenced states
				const expectedStates = Object.assign(
					[undefined, undefined, undefined, undefined, undefined, undefined],
					expectedUnreferencedStates,
				);
				for (const [id, state] of expectedStates.entries()) {
					assert.equal(
						garbageCollector.unreferencedNodesState.get(nodes[id])?.state,
						state,
						`node ${id} should be ${state ?? "referenced"}`,
					);
				}
			}

			// Remove node 2's reference from node 1. This should make node 2 and node 3 unreferenced.
			defaultGCData.gcNodes[nodes[1]] = [];
			await garbageCollector.collectGarbage({});

			// Advance the clock to trigger inactive timeout and validate that we get inactive events.
			clock.tick(inactiveTimeoutMs + 1);
			await garbageCollector.collectGarbage({});
			validateUnreferencedStates({ 2: "Inactive", 3: "Inactive" });

			// Advance the clock to trigger tombstoneTimeoutMs and validate that we get tombstone ready events.
			clock.tick(defaultTombstoneTimeoutMs - inactiveTimeoutMs);
			await garbageCollector.collectGarbage({});
			validateUnreferencedStates({ 2: "TombstoneReady", 3: "TombstoneReady" });

			// Advance the clock the sweep delay and validate that we get sweep ready events.
			clock.tick(defaultSweepGracePeriodMs);
			await garbageCollector.collectGarbage({});
			validateUnreferencedStates({ 2: "SweepReady", 3: "SweepReady" });
		});
	});

	describe("Deleted blobs in GC summary tree", () => {
		it("correctly reads and write deleted blobs in summary", async () => {
			// Set up the GC reference graph to have something to work with.
			defaultGCData.gcNodes["/"] = [nodes[0]];

			// Create a snapshot tree to be used as the GC snapshot tree.
			const gcSnapshotTree = getDummySnapshotTree();
			// Add a blob to the tree for deleted nodes.
			const deletedNodesBlobId = "deletedNodes";
			gcSnapshotTree.blobs[gcDeletedBlobKey] = deletedNodesBlobId;
			const deletedNodeIds = [...nodes];
			// Add deleted nodes list the blobs map that will service read and parse blob calls from GC.
			const gcBlobsMap: Map<string, string[]> = new Map([
				[deletedNodesBlobId, deletedNodeIds],
			]);
			// Create a base snapshot that contains the GC snapshot tree.
			const baseSnapshot = getDummySnapshotTree();
			baseSnapshot.trees[gcTreeKey] = gcSnapshotTree;

			// Create and initialize garbage collector.
			const garbageCollector = createGarbageCollector({
				createParams: { baseSnapshot },
				gcBlobsMap,
			});
			await garbageCollector.initializeBaseState();

			// The nodes in deletedNodeIds should be marked as deleted.
			for (const nodeId of deletedNodeIds) {
				assert(
					garbageCollector.isNodeDeleted(nodeId) === true,
					`${nodeId} should be marked deleted`,
				);
			}

			await garbageCollector.collectGarbage({});
			// Summarize with fullTree as true so that the deleted nodes are written as a blob and can be validated.
			const summaryTree = garbageCollector.summarize(
				true /* fullTree */,
				true /* trackState */,
			);
			assert(summaryTree?.summary.type === SummaryType.Tree, "The summary should be a tree");

			// Get the deleted node ids from summary and validate that its the same as the one GC loaded from.
			const deletedNodesBlob = summaryTree.summary.tree[gcDeletedBlobKey];
			assert(
				deletedNodesBlob.type === SummaryType.Blob,
				"Deleted blob not present in summary",
			);
			const deletedNodeIdsInSummary = JSON.parse(
				deletedNodesBlob.content as string,
			) as string[];
			assert.deepStrictEqual(
				deletedNodeIdsInSummary,
				deletedNodeIds,
				"Unexpected deleted nodes in summary",
			);
		});

		it("writes handle for deleted blobs when its unchanged", async () => {
			// Set up the GC reference graph to have something to work with.
			defaultGCData.gcNodes["/"] = [nodes[0]];

			// Create a snapshot tree to be used as the GC snapshot tree.
			const gcSnapshotTree = getDummySnapshotTree();
			// Add a blob to the tree for deleted nodes.
			const deletedNodesBlobId = "deletedNodes";
			gcSnapshotTree.blobs[gcDeletedBlobKey] = deletedNodesBlobId;
			const deletedNodeIds = [...nodes];
			// Add deleted nodes list the blobs map that will service read and parse blob calls from GC.
			const gcBlobsMap: Map<string, string[]> = new Map([
				[deletedNodesBlobId, deletedNodeIds],
			]);
			// Create a base snapshot that contains the GC snapshot tree.
			const baseSnapshot = getDummySnapshotTree();
			baseSnapshot.trees[gcTreeKey] = gcSnapshotTree;

			// Create and initialize garbage collector.
			const garbageCollector = createGarbageCollector({
				createParams: { baseSnapshot },
				gcBlobsMap,
			});
			await garbageCollector.initializeBaseState();

			// Run GC and summarize. The summary should contain the deleted nodes.
			await garbageCollector.collectGarbage({});
			const gcSummary = garbageCollector.summarize(
				false /* fullTree */,
				true /* trackState */,
			);
			assert(gcSummary?.summary.type === SummaryType.Tree, "The summary should be a tree");

			// Get the deleted node ids from summary and validate that its the same as the one GC loaded from.
			const deletedNodesBlob = gcSummary.summary.tree[gcDeletedBlobKey];
			assert(
				deletedNodesBlob.type === SummaryType.Handle,
				"Deleted nodes state should be a handle",
			);

			await garbageCollector.refreshLatestSummary({
				isSummaryTracked: true,
				isSummaryNewer: true,
			});

			// Run GC and summarize again. The whole GC summary should now be a summary handle.
			await garbageCollector.collectGarbage({});
			const gcSummary2 = garbageCollector.summarize(
				false /* fullTree */,
				true /* trackState */,
			);
			assert(
				gcSummary2?.summary.type === SummaryType.Handle,
				"The summary should be a handle",
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

	/*
	 * These tests validate scenarios where nodes that are referenced between summaries have their unreferenced
	 * timestamp updated. These scenarios fall into the following categories:
	 * 1. Nodes transition from unreferenced -> referenced -> unreferenced between 2 summaries - In these scenarios
	 *    when GC runs, it should detect that the node was referenced and update its unreferenced timestamp.
	 * 2. Unreferenced nodes are referenced from other unreferenced nodes - In this case, even though the node remains
	 *    unreferenced, its unreferenced timestamp should be updated.
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

		describe("Nodes transitioning from unreferenced -> referenced -> unreferenced", () => {
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
				garbageCollector.addedOutboundReference(nodeA, nodeB, Date.now());
				defaultGCData.gcNodes[nodeA] = [nodeB];

				// 3. Remove reference from A to B. E = [].
				defaultGCData.gcNodes[nodeA] = [];

				// 4. Run GC and generate summary 2. E = [].
				const timestamps2 = await getUnreferencedTimestamps();
				assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

				const nodeBTime2 = timestamps2.get(nodeB);

				assert(
					nodeBTime2 !== undefined && nodeBTime2 > nodeBTime1,
					"B's timestamp should have updated",
				);
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
				garbageCollector.addedOutboundReference(nodeA, nodeB, Date.now());
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
				assert(
					nodeBTime2 !== undefined && nodeBTime2 > nodeBTime1,
					"B's timestamp should have updated",
				);
				assert(
					nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1,
					"C's timestamp should have updated",
				);
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
				garbageCollector.addedOutboundReference(nodeA, nodeB, Date.now());
				defaultGCData.gcNodes[nodeA] = [nodeB];

				// 3. Remove reference from A to B. E = [B -\> C, C -\> D].
				defaultGCData.gcNodes[nodeA] = [];

				// 4. Run GC and generate summary 2. E = [B -\> C, C -\> D].
				const timestamps2 = await getUnreferencedTimestamps();
				assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

				const nodeBTime2 = timestamps2.get(nodeB);
				const nodeCTime2 = timestamps2.get(nodeC);
				const nodeDTime2 = timestamps2.get(nodeD);
				assert(
					nodeBTime2 !== undefined && nodeBTime2 > nodeBTime1,
					"B's timestamp should have updated",
				);
				assert(
					nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1,
					"C's timestamp should have updated",
				);
				assert(
					nodeDTime2 !== undefined && nodeDTime2 > nodeDTime1,
					"D's timestamp should have updated",
				);
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
				garbageCollector.addedOutboundReference(nodeA, nodeB, Date.now());
				defaultGCData.gcNodes[nodeA] = [nodeB];

				// 4. Add reference from B to C. E = [A -\> B, B -\> C].
				garbageCollector.addedOutboundReference(nodeB, nodeC, Date.now());
				defaultGCData.gcNodes[nodeB] = [nodeC];

				// 5. Remove reference from B to C. E = [A -\> B].
				defaultGCData.gcNodes[nodeB] = [];

				// 6. Run GC and generate summary 2. E = [A -\> B].
				const timestamps2 = await getUnreferencedTimestamps();
				assert(timestamps2.get(nodeA) === undefined, "A should be referenced");
				assert(timestamps2.get(nodeB) === undefined, "B should be referenced");

				const nodeCTime2 = timestamps2.get(nodeC);
				assert(
					nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1,
					"C's timestamp should have updated",
				);
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
			it(`Scenario 5 - Multiple references added and then removed by same node`, async () => {
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
				garbageCollector.addedOutboundReference(nodeA, nodeB, Date.now());
				defaultGCData.gcNodes[nodeA] = [nodeB];

				// 3. Add reference from A to C. E = [A -\> B, A -\> C].
				garbageCollector.addedOutboundReference(nodeA, nodeC, Date.now());
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
				assert(
					nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1,
					"C's timestamp should have updated",
				);
				assert(
					nodeBTime2 !== undefined && nodeBTime2 > nodeBTime1,
					"B's timestamp should have updated",
				);
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
			it(`Scenario 6 - Reference added without notifying GC`, async () => {
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
				garbageCollector.addedOutboundReference(nodeA, nodeD, Date.now());

				// 5. Run GC and generate summary 2. E = [A -\> B, A -\> C, A -\> E, D -\> C, E -\> A].
				await getUnreferencedTimestamps();

				// Validate that we got the "gcUnknownOutboundReferences" error.
				const unknownReferencesEvent = "GarbageCollector:gcUnknownOutboundReferences";
				const eventsFound = mockLogger.matchEvents(
					[
						{
							eventName: unknownReferencesEvent,
							...tagCodeArtifacts({
								id: "/A",
								routes: JSON.stringify(["/B", "/C"]),
							}),
						},
						{
							eventName: unknownReferencesEvent,
							...tagCodeArtifacts({
								id: "/D",
								routes: JSON.stringify(["/C"]),
							}),
						},
					],
					true /* inlineDetailsProp */,
				);
				assert(eventsFound, `Expected unknownReferenceEvent event!`);
			});
		});

		describe("References to unreferenced nodes", () => {
			/**
			 * Validates that we can detect references that are added from an unreferenced node to another.
			 * 1. Summary 1 at t1. V = [A*, B, C]. E = []. B and C have unreferenced time t1.
			 * 2. Reference from B to C. E = [B -\> C].
			 * 3. Summary 2 at t2. V = [A*, B, C]. E = [B -\> C]. B and C have unreferenced time t1.
			 * Validates that the unreferenced time for B and C is still t1.
			 */
			it(`Scenario 1 - Reference added to unreferenced node`, async () => {
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
				garbageCollector.addedOutboundReference(nodeB, nodeC, Date.now());
				defaultGCData.gcNodes[nodeB] = [nodeC];

				// 3. Run GC and generate summary 2. E = [B -\> C].
				const timestamps2 = await getUnreferencedTimestamps();
				assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

				const nodeBTime2 = timestamps2.get(nodeB);
				const nodeCTime2 = timestamps2.get(nodeC);
				assert(nodeBTime2 === nodeBTime1, "B's timestamp should be unchanged");
				assert(
					nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1,
					"C's timestamp should have updated",
				);
			});

			/*
			 * Validates that we can detect references that are added from an unreferenced node to a list of
			 * unreferenced nodes, i.e., nodes with references to each other but are overall unreferenced.
			 * 1. Summary 1 at t1. V = [A*, B, C, D]. E = [C -\> D]. B, C and D have unreferenced time t1.
			 * 2. Op adds reference from B to C. E = [B -\> C, C -\> D].
			 * 3. Summary 2 at t2. V = [A*, B, C]. E = [B -\> C, C -\> D]. C and D have unreferenced time t2.
			 * Validates that the unreferenced time for C and D is t2 which is > t1.
			 */
			it(`Scenario 2 - Reference added to a list of unreferenced nodes from an unreferenced node`, async () => {
				// Initialize nodes A, B and C.
				defaultGCData.gcNodes["/"] = [nodeA];
				defaultGCData.gcNodes[nodeA] = [];
				defaultGCData.gcNodes[nodeB] = [];
				defaultGCData.gcNodes[nodeC] = [nodeD];
				defaultGCData.gcNodes[nodeD] = [];

				// 1. Run GC and generate summary 1. E = [B -\> C].
				const timestamps1 = await getUnreferencedTimestamps();
				assert(timestamps1.get(nodeA) === undefined, "A should be referenced");

				const nodeBTime1 = timestamps1.get(nodeB);
				const nodeCTime1 = timestamps1.get(nodeC);
				const nodeDTime1 = timestamps1.get(nodeC);
				assert(nodeBTime1 !== undefined, "B should have unreferenced timestamp");
				assert(nodeCTime1 !== undefined, "C should have unreferenced timestamp");
				assert(nodeDTime1 !== undefined, "C should have unreferenced timestamp");

				// 2. Add reference from B to C. E = [B -\> C, C-\> D].
				garbageCollector.addedOutboundReference(nodeB, nodeC, Date.now());
				defaultGCData.gcNodes[nodeB] = [nodeC];

				// 3. Run GC and generate summary 2. E = [B -\> C. C -\> D].
				const timestamps2 = await getUnreferencedTimestamps();
				assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

				const nodeBTime2 = timestamps2.get(nodeB);
				const nodeCTime2 = timestamps2.get(nodeC);
				const nodeDTime2 = timestamps2.get(nodeD);
				assert(nodeBTime2 === nodeBTime1, "B's timestamp should be unchanged");
				assert(
					nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1,
					"C's timestamp should have updated",
				);
				assert(
					nodeDTime2 !== undefined && nodeDTime2 > nodeDTime1,
					"D's timestamp should have updated",
				);
			});

			/*
			 * Validates that we can detect references that are added from an unreferenced node to a list of
			 * unreferenced nodes, i.e., nodes with references to each other but are overall unreferenced. Then
			 * a reference between the list is removed
			 * 1. Summary 1 at t1. V = [A*, B, C, D]. E = [C -> D]. B, C and D have unreferenced time t1.
			 * 2. Op adds reference from B to C. E = [B -> C, C -> D].
			 * 3. Op removes reference from C to D. E = [B -> C].
			 * 4. Summary 2 at t2. V = [A*, B, C]. E = [B -> C]. C and D have unreferenced time t2.
			 * Validates that the unreferenced time for C and D is t2 which is > t1.
			 */
			it(`Scenario 3 - Reference added to a list of unreferenced nodes and a reference is removed`, async () => {
				// Initialize nodes A, B and C.
				defaultGCData.gcNodes["/"] = [nodeA];
				defaultGCData.gcNodes[nodeA] = [];
				defaultGCData.gcNodes[nodeB] = [];
				defaultGCData.gcNodes[nodeC] = [nodeD];
				defaultGCData.gcNodes[nodeD] = [];

				// 1. Run GC and generate summary 1. E = [B -\> C].
				const timestamps1 = await getUnreferencedTimestamps();
				assert(timestamps1.get(nodeA) === undefined, "A should be referenced");

				const nodeBTime1 = timestamps1.get(nodeB);
				const nodeCTime1 = timestamps1.get(nodeC);
				const nodeDTime1 = timestamps1.get(nodeC);
				assert(nodeBTime1 !== undefined, "B should have unreferenced timestamp");
				assert(nodeCTime1 !== undefined, "C should have unreferenced timestamp");
				assert(nodeDTime1 !== undefined, "C should have unreferenced timestamp");

				// 2. Add reference from B to C. E = [B -\> C, C-\> D].
				garbageCollector.addedOutboundReference(nodeB, nodeC, Date.now());
				defaultGCData.gcNodes[nodeB] = [nodeC];

				// 3. Remove reference from C to D. E = [B -\> C].
				defaultGCData.gcNodes[nodeC] = [];

				// 3. Run GC and generate summary 2. E = [B -\> C].
				const timestamps2 = await getUnreferencedTimestamps();
				assert(timestamps2.get(nodeA) === undefined, "A should be referenced");

				const nodeBTime2 = timestamps2.get(nodeB);
				const nodeCTime2 = timestamps2.get(nodeC);
				const nodeDTime2 = timestamps2.get(nodeD);
				assert(nodeBTime2 === nodeBTime1, "B's timestamp should be unchanged");
				assert(
					nodeCTime2 !== undefined && nodeCTime2 > nodeCTime1,
					"C's timestamp should have updated",
				);
				assert(
					nodeDTime2 !== undefined && nodeDTime2 > nodeDTime1,
					"D's timestamp should have updated",
				);
			});
		});
	});

	describe("No changes to GC between summaries", () => {
		const fullTree = false;
		const trackState = true;
		let garbageCollector: IGarbageCollector;

		beforeEach(() => {
			// Initialize nodes A & D.
			defaultGCData.gcNodes = {};
			defaultGCData.gcNodes["/"] = nodes;
		});

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

		it("creates a blob handle when no version specified", async () => {
			garbageCollector = createGarbageCollector();

			await garbageCollector.collectGarbage({});
			const tree1 = garbageCollector.summarize(fullTree, trackState);

			checkGCSummaryType(tree1, SummaryType.Tree, "first");

			await garbageCollector.refreshLatestSummary({
				isSummaryTracked: true,
				isSummaryNewer: true,
			});
			await garbageCollector.collectGarbage({});
			const tree2 = garbageCollector.summarize(fullTree, trackState);

			checkGCSummaryType(tree2, SummaryType.Handle, "second");
		});
	});

	it("resets gc state when loading from an old snapshot format", async () => {
		// Create GC details for node 3's GC blob whose unreferenced time was > timeout ms ago.
		// This means this node should time out as soon as its data is loaded.
		const node3GCDetails: IGarbageCollectionSummaryDetailsLegacy = {
			gcData: { gcNodes: { "/": [] } },
			unrefTimestamp: Date.now() - defaultTombstoneTimeoutMs * 100,
		};
		const node3Snapshot = getDummySnapshotTree();
		const gcBlobId = "node3GCDetails";
		const attributesBlobId = "attributesBlob";
		node3Snapshot.blobs[gcTreeKey] = gcBlobId;
		node3Snapshot.blobs[dataStoreAttributesBlobName] = attributesBlobId;

		// Create a base snapshot that contains snapshot tree of node 3.
		const channelsTree = getDummySnapshotTree();
		channelsTree.trees[nodes[3].slice(1)] = node3Snapshot;
		const baseSnapshot = getDummySnapshotTree();
		baseSnapshot.trees[channelsTreeName] = channelsTree;

		// Set up the getNodeGCDetails function to return the GC details for node 3 when asked by garbage collector.
		const gcBlobsMap = new Map([
			[gcBlobId, node3GCDetails],
			[attributesBlobId, {}],
		]);
		const garbageCollector = createGarbageCollector({
			createParams: { baseSnapshot },
			gcBlobsMap,
			gcMetadata: {
				tombstoneTimeoutMs: defaultTombstoneTimeoutMs,
			},
		});

		// GC state and tombstone state should be discarded but deleted nodes should be read from base snapshot.
		const baseSnapshotData = await garbageCollector.baseSnapshotDataP;
		assert(
			baseSnapshotData === undefined,
			"base snapshot should not be defined for old snapshots where we wrote the gc data in the channels",
		);

		// Initialize from the base state and validate that tombstones has 0 entry because it was discarded.
		// Deleted nodes should have one entry because it is still used.
		await garbageCollector.initializeBaseState();
		assert.strictEqual(garbageCollector.tombstones.length, 0, "Expecting 0 tombstone nodes");
		assert.strictEqual(garbageCollector.deletedNodes.size, 0, "Expecting 0 deleted nodes");
	});

	it("process remote op with unrecognized type", async () => {
		const garbageCollector = createGarbageCollector();
		const gcMessageFromFuture: Record<string, unknown> = {
			type: "FUTURE_MESSAGE",
			hello: "HELLO",
		};
		assert.throws(
			() =>
				garbageCollector.processMessages(
					[gcMessageFromFuture as unknown as GarbageCollectionMessage],
					Date.now(),
					false /* local */,
				),
			(error: IErrorBase) => error.errorType === ContainerErrorTypes.dataProcessingError,
			"Garbage collection message of unknown type FUTURE_MESSAGE",
		);
	});
});
