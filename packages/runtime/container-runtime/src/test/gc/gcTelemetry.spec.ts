/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions/internal";
import {
	MockLogger,
	MonitoringContext,
	TelemetryDataTag,
	createChildLogger,
	mixinMonitoringContext,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils/internal";
import { SinonFakeTimers, useFakeTimers } from "sinon";

import { blobManagerBasePath } from "../../blobManager/index.js";
import {
	// eslint-disable-next-line import/no-deprecated
	GCNodeType,
	GCTelemetryTracker,
	IGarbageCollectorConfigs,
	UnreferencedStateTracker,
	cloneGCData,
	defaultSessionExpiryDurationMs,
	oneDayMs,
	// eslint-disable-next-line import/no-deprecated
	stableGCVersion,
} from "../../gc/index.js";
import { pkgVersion } from "../../packageVersion.js";

describe("GC Telemetry Tracker", () => {
	const defaultSnapshotCacheExpiryMs = 5 * 24 * 60 * 60 * 1000;
	const tombstoneTimeoutMs =
		defaultSessionExpiryDurationMs + defaultSnapshotCacheExpiryMs + oneDayMs;
	const inactiveTimeoutMs = 500;

	// Nodes in the reference graph.
	const nodes: string[] = ["/node1", "/node2", "/node3", "/node4"];

	const testPkgPath = ["testPkg"];
	// The package data is tagged in the telemetry event.
	const eventPkg = { value: testPkgPath.join("/"), tag: TelemetryDataTag.CodeArtifact };

	let mockLogger: MockLogger;
	let mc: MonitoringContext;
	let clock: SinonFakeTimers;
	let sweepGracePeriodMs = 1000; // Default case for these tests
	let unreferencedNodesState: Map<string, UnreferencedStateTracker> = new Map();
	let telemetryTracker: GCTelemetryTracker;

	function createTelemetryTracker(
		enableSweep: boolean,
		// eslint-disable-next-line import/no-deprecated
		isSummarizerClient = true,
	): GCTelemetryTracker {
		// Node types are as follows based on the path:
		// Path starting with "/_blobs" - blob.
		// Path with one part such as "/id1" - data stores.
		// Path with two parts such as "/id1/id2" - sub data stores.
		// Everything else - other.
		const getNodeType = (nodePath: string) => {
			if (nodePath.split("/")[1] === blobManagerBasePath) {
				// eslint-disable-next-line import/no-deprecated
				return GCNodeType.Blob;
			}
			if (nodePath.split("/").length === 2) {
				// eslint-disable-next-line import/no-deprecated
				return GCNodeType.DataStore;
			}
			if (nodePath.split("/").length === 3) {
				// eslint-disable-next-line import/no-deprecated
				return GCNodeType.SubDataStore;
			}
			// eslint-disable-next-line import/no-deprecated
			return GCNodeType.Other;
		};
		const configs: IGarbageCollectorConfigs = {
			gcAllowed: true,
			sweepAllowed: false,
			sweepEnabled: false,
			runFullGC: false,
			testMode: false,
			inactiveTimeoutMs,
			sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
			tombstoneTimeoutMs: enableSweep ? tombstoneTimeoutMs : undefined,
			sweepGracePeriodMs,
			throwOnTombstoneLoad: false,
			persistedGcFeatureMatrix: undefined,
			// eslint-disable-next-line import/no-deprecated
			gcVersionInBaseSnapshot: stableGCVersion,
			// eslint-disable-next-line import/no-deprecated
			gcVersionInEffect: stableGCVersion,
		};
		const tracker = new GCTelemetryTracker(
			mc,
			configs,
			// eslint-disable-next-line import/no-deprecated
			isSummarizerClient,
			{ createContainerRuntimeVersion: pkgVersion },
			getNodeType,
			(nodeId: string) => unreferencedNodesState.get(nodeId),
			async (nodeId: string) => testPkgPath,
		);
		return tracker;
	}

	/**
	 * For each node in nodeIds, add an entry in `unreferencedNodesState` indicating that the node was
	 * just unreferenced.
	 */
	function markNodesUnreferenced(nodeIds: string[]) {
		nodeIds.forEach((nodeId) => {
			unreferencedNodesState.set(
				nodeId,
				new UnreferencedStateTracker(
					Date.now(),
					inactiveTimeoutMs,
					Date.now(),
					tombstoneTimeoutMs,
					sweepGracePeriodMs,
				),
			);
		});
	}

	// Mock node loaded and changed activity for the given nodes.
	function mockNodeChanges(nodeIds: string[]) {
		nodeIds.forEach((id) => {
			telemetryTracker.nodeUsed(id, {
				id,
				usageType: "Loaded",
				currentReferenceTimestampMs: Date.now(),
				packagePath: testPkgPath,
				completedGCRuns: 0,
				isTombstoned: false,
			});
			telemetryTracker.nodeUsed(id, {
				id,
				usageType: "Changed",
				currentReferenceTimestampMs: Date.now(),
				packagePath: testPkgPath,
				completedGCRuns: 0,
				isTombstoned: false,
			});
		});
	}

	// Mock node revived activity for the given nodes.
	function reviveNode(fromId: string, toId: string, isTombstoned = false) {
		telemetryTracker.nodeUsed(toId, {
			id: toId,
			usageType: "Revived",
			currentReferenceTimestampMs: Date.now(),
			packagePath: testPkgPath,
			completedGCRuns: 0,
			isTombstoned,
			fromId,
		});
		unreferencedNodesState.delete(toId);
	}

	/**
	 * For summarizer clients, inactive / sweep ready events are not logged when on node usage. They are logged when GC
	 * runs next time. This emulates that by calling the functions in the telemetry tracker that are called when GC runs.
	 */
	// eslint-disable-next-line import/no-deprecated
	async function simulateGCToTriggerEvents(isSummarizerClient: boolean) {
		// eslint-disable-next-line import/no-deprecated
		if (!isSummarizerClient) {
			return;
		}
		await telemetryTracker.logPendingEvents(mc.logger);
	}

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		mockLogger = new MockLogger();
		mc = mixinMonitoringContext(
			createChildLogger({ logger: mockLogger, namespace: "GarbageCollector" }),
		);
		unreferencedNodesState = new Map();
	});

	afterEach(() => {
		clock.reset();
		mockLogger.clear();
		sweepGracePeriodMs = 1000; // Default case for these tests
	});

	after(() => {
		clock.restore();
	});

	// Tests that are run once for summarizer client and once for interactive client.
	// eslint-disable-next-line import/no-deprecated
	const clientTypeTests = (isSummarizerClient: boolean) => {
		/**
		 * Asserts that the events are as expected based on whether its a summarizer client or not. In non-summarizer
		 * clients, only "InactiveObject_Loaded", "TombstoneReadyObject_Loaded" and "SweepReadyObject_Loaded" events are logged.
		 * "_Changed" and "_Revived" events are not logged.
		 */
		function assertMatchEvents(
			events: Omit<ITelemetryBaseEvent, "category">[],
			message: string,
		) {
			const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
			const unexpectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
			// For non-summarizer clients, events that are not "Loaded" are unexpected. Everything else is expected.
			for (const event of events) {
				const eventName = event.eventName as string;
				// eslint-disable-next-line import/no-deprecated
				if (!isSummarizerClient && !eventName.includes("Loaded")) {
					unexpectedEvents.push(event);
				} else {
					expectedEvents.push(event);
				}
			}

			mockLogger.assertMatch(
				expectedEvents,
				message,
				true /* inlineDetailsProp */,
				false /* clearEventsAfterCheck */, // Don't clear events so we can run another check.
			);
			mockLogger.assertMatchNone(unexpectedEvents, message, true /* inlineDetailsProp */);
		}

		it("generates inactive, tombstone ready, and sweep ready events when nodes are used after time out", async () => {
			// eslint-disable-next-line import/no-deprecated
			telemetryTracker = createTelemetryTracker(true /* enable Sweep */, isSummarizerClient);
			// Mark nodes 2 and 3 as unreferenced.
			markNodesUnreferenced([nodes[2], nodes[3]]);

			// Advance the clock to trigger inactive timeout and validate that inactive events are as expected.
			clock.tick(inactiveTimeoutMs + 1);
			mockNodeChanges(nodes);
			// eslint-disable-next-line import/no-deprecated
			await simulateGCToTriggerEvents(isSummarizerClient);
			assertMatchEvents(
				[
					{
						eventName: "GarbageCollector:InactiveObject_Loaded",
						timeout: inactiveTimeoutMs,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
					{
						eventName: "GarbageCollector:InactiveObject_Changed",
						timeout: inactiveTimeoutMs,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
					{
						eventName: "GarbageCollector:InactiveObject_Loaded",
						timeout: inactiveTimeoutMs,
						...tagCodeArtifacts({ id: nodes[3] }),
					},
					{
						eventName: "GarbageCollector:InactiveObject_Changed",
						timeout: inactiveTimeoutMs,
						...tagCodeArtifacts({ id: nodes[3] }),
					},
				],
				"inactive events not as expected",
			);

			// Advance the clock to trigger tombstone timeout and validate that TombstoneReady events are as expected.
			clock.tick(tombstoneTimeoutMs - inactiveTimeoutMs);
			mockNodeChanges(nodes);
			// eslint-disable-next-line import/no-deprecated
			await simulateGCToTriggerEvents(isSummarizerClient);
			assertMatchEvents(
				[
					{
						eventName: "GarbageCollector:TombstoneReadyObject_Loaded",
						timeout: tombstoneTimeoutMs,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
					{
						eventName: "GarbageCollector:TombstoneReadyObject_Changed",
						timeout: tombstoneTimeoutMs,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
					{
						eventName: "GarbageCollector:TombstoneReadyObject_Loaded",
						timeout: tombstoneTimeoutMs,
						...tagCodeArtifacts({ id: nodes[3] }),
					},
					{
						eventName: "GarbageCollector:TombstoneReadyObject_Changed",
						timeout: tombstoneTimeoutMs,
						...tagCodeArtifacts({ id: nodes[3] }),
					},
				],
				"tombstone ready events not as expected",
			);

			// Advance the clock by the delay and validate that SweepReady events are as expected.
			clock.tick(sweepGracePeriodMs);
			mockNodeChanges(nodes);
			// eslint-disable-next-line import/no-deprecated
			await simulateGCToTriggerEvents(isSummarizerClient);
			assertMatchEvents(
				[
					{
						eventName: "GarbageCollector:SweepReadyObject_Loaded",
						timeout: tombstoneTimeoutMs + sweepGracePeriodMs,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Changed",
						timeout: tombstoneTimeoutMs + sweepGracePeriodMs,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Loaded",
						timeout: tombstoneTimeoutMs + sweepGracePeriodMs,
						...tagCodeArtifacts({ id: nodes[3] }),
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Changed",
						timeout: tombstoneTimeoutMs + sweepGracePeriodMs,
						...tagCodeArtifacts({ id: nodes[3] }),
					},
				],
				"sweep ready events not as expected",
			);
		});

		it("generates tombstone revived events when nodes are used after they are tombstoned", async () => {
			// eslint-disable-next-line import/no-deprecated
			telemetryTracker = createTelemetryTracker(true /* enable Sweep */, isSummarizerClient);
			// Mark node 2 as unreferenced.
			markNodesUnreferenced([nodes[2]]);

			// Advance the clock to trigger tombstone timeout and validate that tombstone revived event is as expected.
			clock.tick(tombstoneTimeoutMs + 1);
			reviveNode(nodes[1], nodes[2], true /* isTombstoned */);
			mockLogger.assertMatch(
				[
					{
						eventName: "GarbageCollector:GC_Tombstone_DataStore_Revived",
						pkg: eventPkg,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
				],
				"inactive events not as expected",
			);
		});

		/**
		 * Tests that validate either the relevant events are logged as expected.
		 */
		const unreferencedPhasesEventTests = (
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

			beforeEach(() => {
				if (sweepGracePeriodMsOverride !== undefined) {
					sweepGracePeriodMs = sweepGracePeriodMsOverride;
				}
				telemetryTracker = createTelemetryTracker(
					mode !== "inactive" /* enableSweep */,
					// eslint-disable-next-line import/no-deprecated
					isSummarizerClient,
				);
			});

			it("doesn't generate events for referenced nodes", async () => {
				mockNodeChanges(nodes);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();

				// Advance the clock to just before the timeout expires, update nodes and validate no events.
				clock.tick(timeout - 1);
				mockNodeChanges(nodes);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();

				// Advance the clock to expire the timeout, update nodes and validate no events.
				clock.tick(1);
				mockNodeChanges(nodes);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();
			});

			it("generates events for nodes that are used after state changes", async () => {
				// Mark nodes 1 and 2 as unreferenced.
				markNodesUnreferenced([nodes[1], nodes[2]]);

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				mockNodeChanges(nodes);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();

				// Expire the timeout, update nodes and validate that all events for node 1 and node 2 are logged.
				clock.tick(1);
				mockNodeChanges(nodes);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				expectedEvents.push(
					{
						eventName: loadedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[1], pkg: testPkgPath.join("/") }),
						createContainerRuntimeVersion: pkgVersion,
					},
					{
						eventName: changedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[1], pkg: testPkgPath.join("/") }),
						createContainerRuntimeVersion: pkgVersion,
					},
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
				);
				assertMatchEvents(expectedEvents, "all events not as expected");

				// Revived node 2 and validate that revived event is as expected.
				reviveNode(nodes[0], nodes[2]);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				assertMatchEvents(
					[
						{
							eventName: revivedEventName,
							timeout,
							...tagCodeArtifacts({
								id: nodes[2],
								fromId: nodes[0],
								pkg: testPkgPath.join("/"),
							}),
						},
					],
					"revived event not as expected",
				);
			});

			it("generates events properly for untracked subDataStore paths", async () => {
				// Mark node 1 as unreferenced.
				markNodesUnreferenced([nodes[1]]);

				// We'll mock a Loaded event for this path, passing the DataStore path as trackedId to ensure coverage
				const subDataStorePath = `${nodes[1]}/something`;

				// Expire the timeout, update nodes and validate that all events for node 1 are logged.
				clock.tick(timeout);
				telemetryTracker.nodeUsed(nodes[1], {
					id: subDataStorePath,
					usageType: "Loaded",
					currentReferenceTimestampMs: Date.now(),
					packagePath: testPkgPath,
					completedGCRuns: 0,
					isTombstoned: false,
				});
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				expectedEvents.push({
					eventName: loadedEventName,
					timeout,
					...tagCodeArtifacts({ id: subDataStorePath, pkg: testPkgPath.join("/") }),
					createContainerRuntimeVersion: pkgVersion,
					isTombstoned: false,
					trackedId: nodes[1],
					type: "SubDataStore",
				});
				assertMatchEvents(expectedEvents, "all events not as expected");
			});

			it("generates events once per node", async () => {
				// Mark node 2 as unreferenced.
				markNodesUnreferenced([nodes[2]]);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				mockNodeChanges(nodes);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();

				// Expire the timeout, updated nodes and validate that events are logged as expected.
				clock.tick(1);
				mockNodeChanges(nodes);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				expectedEvents.push(
					{
						eventName: loadedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[2] }),
						pkg: eventPkg,
					},
					{
						eventName: changedEventName,
						timeout,
						...tagCodeArtifacts({ id: nodes[2] }),
						pkg: eventPkg,
					},
				);
				assertMatchEvents(expectedEvents, "all events not as expected");

				// Update all nodes again. There shouldn't be any more events since for each node the event is only once.
				mockNodeChanges(nodes);
				// eslint-disable-next-line import/no-deprecated
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();
			});

			// This test is only relevant for summarizer client because it does not log changed events if the node is revived.
			// eslint-disable-next-line import/no-deprecated
			if (isSummarizerClient) {
				it("generates only revived event in summarizer when a node is updated and revived", async () => {
					// Mark node 2 as unreferenced.
					markNodesUnreferenced([nodes[2]]);

					// Advance the clock just before the timeout and validate no unexpected events are logged.
					clock.tick(timeout - 1);
					mockNodeChanges(nodes);
					// eslint-disable-next-line import/no-deprecated
					await simulateGCToTriggerEvents(isSummarizerClient);

					validateNoEvents();

					// Expire the timeout and validate that only revived event is generated for node 2.
					clock.tick(1);
					mockNodeChanges([nodes[2]]);
					reviveNode(nodes[1], nodes[2]);
					// eslint-disable-next-line import/no-deprecated
					await simulateGCToTriggerEvents(isSummarizerClient);

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
					assertMatchEvents(
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
						"revived event not as expected",
					);
				});
			}
		};

		describe("Inactive events", () => {
			unreferencedPhasesEventTests(
				inactiveTimeoutMs,
				"inactive",
				"GarbageCollector:InactiveObject_Revived",
				"GarbageCollector:InactiveObject_Changed",
				"GarbageCollector:InactiveObject_Loaded",
			);
		});

		describe("TombstoneReady events", () => {
			unreferencedPhasesEventTests(
				tombstoneTimeoutMs,
				"tombstone",
				"GarbageCollector:TombstoneReadyObject_Revived",
				"GarbageCollector:TombstoneReadyObject_Changed",
				"GarbageCollector:TombstoneReadyObject_Loaded",
			);
		});

		describe("SweepReady events (with no delay)", () => {
			unreferencedPhasesEventTests(
				tombstoneTimeoutMs,
				"sweep", // Jump straight to SweepReady given 0 delay
				"GarbageCollector:SweepReadyObject_Revived",
				"GarbageCollector:SweepReadyObject_Changed",
				"GarbageCollector:SweepReadyObject_Loaded",
				0 /* sweepGracePeriodMsOverride */,
			);
		});

		describe("SweepReady events", () => {
			unreferencedPhasesEventTests(
				tombstoneTimeoutMs + sweepGracePeriodMs,
				"sweep",
				"GarbageCollector:SweepReadyObject_Revived",
				"GarbageCollector:SweepReadyObject_Changed",
				"GarbageCollector:SweepReadyObject_Loaded",
			);
		});
	};

	// eslint-disable-next-line import/no-deprecated
	describe("Summarizer client", () => {
		// eslint-disable-next-line import/no-deprecated
		clientTypeTests(true /* isSummarizerClient */);
	});

	describe("Interactive client", () => {
		// eslint-disable-next-line import/no-deprecated
		clientTypeTests(false /* isSummarizerClient */);
	});

	describe("gcUnknownOutboundReferences telemetry", () => {
		const unknownReferenceEventName = "GarbageCollector:gcUnknownOutboundReferences";
		const currentGCData: IGarbageCollectionData = { gcNodes: {} };
		let previousGCData: IGarbageCollectionData;
		let explicitReferences: Map<string, string[]>;

		beforeEach(() => {
			telemetryTracker = createTelemetryTracker(
				true /* enableSweep */,
				// eslint-disable-next-line import/no-deprecated
				true /* isSummarizerClient */,
			);

			currentGCData.gcNodes["/"] = [nodes[0]];
			currentGCData.gcNodes[nodes[0]] = [nodes[1]];
			currentGCData.gcNodes[nodes[1]] = [nodes[0], nodes[2]];
			currentGCData.gcNodes[nodes[2]] = [nodes[1], nodes[3]];
			currentGCData.gcNodes[nodes[3]] = [nodes[0]];

			previousGCData = cloneGCData(currentGCData);
			explicitReferences = new Map();
		});

		it("does not log gcUnknownOutboundReferences when there are no new references", async () => {
			telemetryTracker.logIfMissingExplicitReferences(
				currentGCData,
				previousGCData,
				explicitReferences,
				mc.logger,
			);

			mockLogger.assertMatchNone(
				[
					{
						eventName: unknownReferenceEventName,
					},
				],
				"There should be no gcUnknownOutboundReferences event",
			);
		});

		it("logs gcUnknownOutboundReferences when there are unknown data store references", async () => {
			const id = nodes[0];
			const routes = [nodes[2], nodes[3]];
			currentGCData.gcNodes[id] = routes;

			telemetryTracker.logIfMissingExplicitReferences(
				currentGCData,
				previousGCData,
				explicitReferences,
				mc.logger,
			);

			mockLogger.assertMatch(
				[
					{
						eventName: unknownReferenceEventName,
						...tagCodeArtifacts({ id, routes: JSON.stringify(routes) }),
					},
				],
				"gcUnknownOutboundReferences event not logged as expected",
			);
		});

		it("logs gcUnknownOutboundReferences when there are multiple unknown data store references", async () => {
			const id1 = nodes[0];
			const routes1 = [nodes[2], nodes[3]];
			const id2 = nodes[3];
			const routes2 = [nodes[1], nodes[2]];
			currentGCData.gcNodes[id1] = routes1;
			currentGCData.gcNodes[id2] = routes2;

			telemetryTracker.logIfMissingExplicitReferences(
				currentGCData,
				previousGCData,
				explicitReferences,
				mc.logger,
			);

			mockLogger.assertMatch(
				[
					{
						eventName: unknownReferenceEventName,
						...tagCodeArtifacts({ id: id1, routes: JSON.stringify(routes1) }),
					},
					{
						eventName: unknownReferenceEventName,
						...tagCodeArtifacts({ id: id2, routes: JSON.stringify(routes2) }),
					},
				],
				"gcUnknownOutboundReferences event not logged as expected",
			);
		});

		it("logs gcUnknownOutboundReferences when there are unknown blob references", async () => {
			const id = nodes[0];
			// Id of type `/_blobs/id1 is treated as a blob node.
			const routes = ["/_blobs/id1"];
			currentGCData.gcNodes[id] = routes;

			telemetryTracker.logIfMissingExplicitReferences(
				currentGCData,
				previousGCData,
				explicitReferences,
				mc.logger,
			);

			mockLogger.assertMatch(
				[
					{
						eventName: unknownReferenceEventName,
						...tagCodeArtifacts({ id, routes: JSON.stringify(routes) }),
					},
				],
				"gcUnknownOutboundReferences event not logged as expected for blob nodes",
			);
		});

		it("does not log gcUnknownOutboundReferences for back-routes (ex: DDS to data store)", async () => {
			// Id of type `/id1/id2 is treated as a sub-data store (DDS) node.
			const id = `${nodes[1]}/dds`;
			const routes = [nodes[1]];
			currentGCData.gcNodes[id] = routes;

			telemetryTracker.logIfMissingExplicitReferences(
				currentGCData,
				previousGCData,
				explicitReferences,
				mc.logger,
			);

			mockLogger.assertMatchNone(
				[
					{
						eventName: unknownReferenceEventName,
					},
				],
				"There should be no gcUnknownOutboundReferences event when back-routes are added",
			);
		});

		it("does not log gcUnknownOutboundReferences for sub-dataStore routes (ex: to DDS)", async () => {
			const id = nodes[1];
			// Id of type `/id1/id2 is treated as a sub-data store (DDS) node.
			const routes = [`${nodes[1]}/dds`];
			currentGCData.gcNodes[id] = routes;

			telemetryTracker.logIfMissingExplicitReferences(
				currentGCData,
				previousGCData,
				explicitReferences,
				mc.logger,
			);

			mockLogger.assertMatchNone(
				[
					{
						eventName: unknownReferenceEventName,
					},
				],
				"There should be no gcUnknownOutboundReferences event when sub-dataStore routes are added",
			);
		});

		it("does not log gcUnknownOutboundReferences for other routes (ex: unknown routes)", async () => {
			const id = nodes[1];
			// Id of type `/id1/id2/ids31` is treated as a other node type.
			const routes = [`${nodes[1]}/ids2/ids3`];
			currentGCData.gcNodes[id] = routes;

			telemetryTracker.logIfMissingExplicitReferences(
				currentGCData,
				previousGCData,
				explicitReferences,
				mc.logger,
			);

			mockLogger.assertMatchNone(
				[
					{
						eventName: unknownReferenceEventName,
					},
				],
				"There should be no gcUnknownOutboundReferences event when other node routes are added",
			);
		});
	});
});
