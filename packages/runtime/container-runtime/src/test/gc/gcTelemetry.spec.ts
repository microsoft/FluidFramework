/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions";
import {
	MockLogger,
	TelemetryDataTag,
	ConfigTypes,
	mixinMonitoringContext,
	MonitoringContext,
	createChildLogger,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils";
import {
	GCNodeType,
	GCTelemetryTracker,
	defaultSessionExpiryDurationMs,
	oneDayMs,
	disableSweepLogKey,
	UnreferencedStateTracker,
	cloneGCData,
} from "../../gc";
import { pkgVersion } from "../../packageVersion";
import { BlobManager } from "../../blobManager";
import { configProvider } from "./gcUnitTestHelpers";

describe("GC Telemetry Tracker", () => {
	const defaultSnapshotCacheExpiryMs = 5 * 24 * 60 * 60 * 1000;
	const sweepTimeoutMs = defaultSessionExpiryDurationMs + defaultSnapshotCacheExpiryMs + oneDayMs;
	const inactiveTimeoutMs = 500;

	// Nodes in the reference graph.
	const nodes: string[] = ["/node1", "/node2", "/node3", "/node4"];

	const testPkgPath = ["testPkg"];
	// The package data is tagged in the telemetry event.
	const eventPkg = { value: testPkgPath.join("/"), tag: TelemetryDataTag.CodeArtifact };

	let injectedSettings: Record<string, ConfigTypes> = {};
	let mockLogger: MockLogger;
	let mc: MonitoringContext;
	let clock: SinonFakeTimers;
	let unreferencedNodesState: Map<string, UnreferencedStateTracker> = new Map();
	let telemetryTracker: GCTelemetryTracker;

	function createTelemetryTracker(
		enableSweep: boolean,
		isSummarizerClient = true,
	): GCTelemetryTracker {
		// Node types are as follows based on the path:
		// Path starting with "/_blobs" - blob.
		// Path with one part such as "/id1" - data stores.
		// Path with two parts such as "/id1/id2" - sub data stores.
		// Everything else - other.
		const getNodeType = (nodePath: string) => {
			if (nodePath.split("/")[1] === BlobManager.basePath) {
				return GCNodeType.Blob;
			}
			if (nodePath.split("/").length === 2) {
				return GCNodeType.DataStore;
			}
			if (nodePath.split("/").length === 3) {
				return GCNodeType.SubDataStore;
			}
			return GCNodeType.Other;
		};
		const tracker = new GCTelemetryTracker(
			mc,
			{ inactiveTimeoutMs, sweepTimeoutMs: enableSweep ? sweepTimeoutMs : undefined },
			isSummarizerClient,
			false /* gcTombstoneEnforcementAllowed */,
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
					sweepTimeoutMs,
				),
			);
		});
	}

	// Mock node loaded and changed activity for the given nodes.
	function mockNodeChanges(nodeIds: string[]) {
		nodeIds.forEach((id) => {
			telemetryTracker.nodeUsed({
				id,
				usageType: "Loaded",
				currentReferenceTimestampMs: Date.now(),
				packagePath: testPkgPath,
				completedGCRuns: 0,
				isTombstoned: false,
			});
			telemetryTracker.nodeUsed({
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
		telemetryTracker.nodeUsed({
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
	async function simulateGCToTriggerEvents(isSummarizerClient: boolean) {
		if (!isSummarizerClient) {
			return;
		}
		telemetryTracker.logSweepEvents(mc.logger, Date.now(), unreferencedNodesState, 0);
		await telemetryTracker.logPendingEvents(mc.logger);
	}

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		mockLogger = new MockLogger();
		mc = mixinMonitoringContext(
			createChildLogger({ logger: mockLogger, namespace: "GarbageCollector" }),
			configProvider(injectedSettings),
		);
		unreferencedNodesState = new Map();
	});

	afterEach(() => {
		clock.reset();
		mockLogger.clear();
		injectedSettings = {};
	});

	after(() => {
		clock.restore();
	});

	// Tests that are run once for summarizer client and once for interactive client.
	const clientTypeTests = (isSummarizerClient: boolean) => {
		/**
		 * Asserts that the events are as expected based on whether its a summarizer client or not. In non-summarizer
		 * clients, only "InactiveObject_Loaded" and "SweepReadyObject_Loaded" events are logged. "Changed" and "Revived"
		 * events are not logged.
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
				if (!isSummarizerClient && !eventName.includes("Loaded")) {
					unexpectedEvents.push(event);
				} else {
					expectedEvents.push(event);
				}
			}

			// Note that mock logger clears all events after one of the `match` functions is called. Since we call match
			// functions twice, cache the events and repopulate the mock logger with if after the first match call.
			const cachedEvents = Array.from(mockLogger.events);
			mockLogger.assertMatch(expectedEvents, message, true /* inlineDetailsProp */);
			mockLogger.events = cachedEvents;
			mockLogger.assertMatchNone(unexpectedEvents, message, true /* inlineDetailsProp */);
		}

		it("generates inactive and sweep ready events when nodes are used after time out", async () => {
			telemetryTracker = createTelemetryTracker(true /* enable Sweep */, isSummarizerClient);
			// Mark nodes 2 and 3 as unreferenced.
			markNodesUnreferenced([nodes[2], nodes[3]]);

			// Advance the clock to trigger inactive timeout and validate that inactive events are as expected.
			clock.tick(inactiveTimeoutMs + 1);
			mockNodeChanges(nodes);
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

			// Advance the clock to trigger sweep timeout and validate that sweep ready events are as expected.
			clock.tick(sweepTimeoutMs - inactiveTimeoutMs);
			mockNodeChanges(nodes);
			await simulateGCToTriggerEvents(isSummarizerClient);
			assertMatchEvents(
				[
					{
						eventName: "GarbageCollector:SweepReadyObject_Loaded",
						timeout: sweepTimeoutMs,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Changed",
						timeout: sweepTimeoutMs,
						...tagCodeArtifacts({ id: nodes[2] }),
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Loaded",
						timeout: sweepTimeoutMs,
						...tagCodeArtifacts({ id: nodes[3] }),
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Changed",
						timeout: sweepTimeoutMs,
						...tagCodeArtifacts({ id: nodes[3] }),
					},
				],
				"sweep ready events not as expected",
			);
		});

		it("generates tombstone revived events when nodes are used after they are tombstoned", async () => {
			telemetryTracker = createTelemetryTracker(true /* enable Sweep */, isSummarizerClient);
			// Mark node 2 as unreferenced.
			markNodesUnreferenced([nodes[2]]);

			// Advance the clock to trigger sweep timeout and validate that tombstone revived event is as expected.
			clock.tick(sweepTimeoutMs + 1);
			reviveNode(nodes[1], nodes[2], true /* isTombstoned */);
			mockLogger.assertMatch(
				[
					{
						eventName: "GarbageCollector:GC_Tombstone_DataStore_Revived",
						...tagCodeArtifacts({ url: nodes[2] }),
					},
				],
				"inactive events not as expected",
			);
		});

		/** Tests that validate either inactive or sweep events are logged as expected. */
		const inactiveOrSweepEventTests = (
			timeout: number,
			mode: "inactive" | "sweep",
			revivedEventName: string,
			changedEventName: string,
			loadedEventName: string,
			expectDeleteLogs?: boolean,
		) => {
			const deleteEventName = "GarbageCollector:GC_SweepReadyObjects_Delete";

			// Validates that no unexpected event has been fired.
			function validateNoEvents() {
				mockLogger.assertMatchNone(
					[
						{ eventName: revivedEventName },
						{ eventName: changedEventName },
						{ eventName: loadedEventName },
						{ eventName: deleteEventName },
					],
					"unexpected events logged",
				);
			}

			beforeEach(() => {
				telemetryTracker = createTelemetryTracker(
					mode === "sweep" ? true : false /* enableSweep */,
					isSummarizerClient,
				);
			});

			it("doesn't generate events for referenced nodes", async () => {
				mockNodeChanges(nodes);
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();

				// Advance the clock to just before the timeout expires, update nodes and validate no events.
				clock.tick(timeout - 1);
				mockNodeChanges(nodes);
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();

				// Advance the clock to expire the timeout, update nodes and validate no events.
				clock.tick(1);
				mockNodeChanges(nodes);
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();
			});

			it("generates events for nodes that are used after inactive / sweep ready", async () => {
				// Mark nodes 1 and 2 as unreferenced.
				markNodesUnreferenced([nodes[1], nodes[2]]);

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				mockNodeChanges(nodes);
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();

				// Expire the timeout, update nodes and validate that all events for node 1 and node 2 are logged.
				clock.tick(1);
				mockNodeChanges(nodes);
				await simulateGCToTriggerEvents(isSummarizerClient);
				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				if (expectDeleteLogs && isSummarizerClient) {
					expectedEvents.push({
						eventName: deleteEventName,
						timeout,
						...tagCodeArtifacts({ id: JSON.stringify([nodes[1], nodes[2]]) }),
					});
				} else {
					assert(
						!mockLogger.events.some((event) => event.eventName === deleteEventName),
						"Should not have any delete events logged",
					);
				}
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

			it("generates events once per node", async () => {
				// Mark node 2 as unreferenced.
				markNodesUnreferenced([nodes[2]]);
				await simulateGCToTriggerEvents(isSummarizerClient);

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				mockNodeChanges(nodes);
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();

				// Expire the timeout, updated nodes and validate that events are logged as expected.
				clock.tick(1);
				mockNodeChanges(nodes);
				await simulateGCToTriggerEvents(isSummarizerClient);
				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				if (expectDeleteLogs && isSummarizerClient) {
					expectedEvents.push({
						eventName: deleteEventName,
						timeout,
						...tagCodeArtifacts({ id: JSON.stringify([nodes[2]]) }),
					});
				} else {
					assert(
						!mockLogger.events.some((event) => event.eventName === deleteEventName),
						"Should not have any delete events logged",
					);
				}
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
				await simulateGCToTriggerEvents(isSummarizerClient);
				validateNoEvents();
			});

			// This test is only relevant for summarizer client because it does not log changed events if the node is revived.
			if (isSummarizerClient) {
				it("generates only revived event in summarizer when an inactive node is updated and revived", async () => {
					// Mark node 2 as unreferenced.
					markNodesUnreferenced([nodes[2]]);

					// Advance the clock just before the timeout and validate no unexpected events are logged.
					clock.tick(timeout - 1);
					mockNodeChanges(nodes);
					await simulateGCToTriggerEvents(isSummarizerClient);

					validateNoEvents();

					// Expire the timeout and validate that only revived event is generated for node 2.
					clock.tick(1);
					mockNodeChanges([nodes[2]]);
					reviveNode(nodes[1], nodes[2]);
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
			inactiveOrSweepEventTests(
				inactiveTimeoutMs,
				"inactive",
				"GarbageCollector:InactiveObject_Revived",
				"GarbageCollector:InactiveObject_Changed",
				"GarbageCollector:InactiveObject_Loaded",
			);
		});

		describe("SweepReady events", () => {
			beforeEach(() => {
				injectedSettings[disableSweepLogKey] = true;
			});

			inactiveOrSweepEventTests(
				sweepTimeoutMs,
				"sweep",
				"GarbageCollector:SweepReadyObject_Revived",
				"GarbageCollector:SweepReadyObject_Changed",
				"GarbageCollector:SweepReadyObject_Loaded",
				false, // expectDeleteLogs
			);
		});

		if (isSummarizerClient) {
			describe("SweepReady events - with delete log", () => {
				inactiveOrSweepEventTests(
					sweepTimeoutMs,
					"sweep",
					"GarbageCollector:SweepReadyObject_Revived",
					"GarbageCollector:SweepReadyObject_Changed",
					"GarbageCollector:SweepReadyObject_Loaded",
					true, // expectDeleteLogs
				);
			});
		}
	};

	describe("Summarizer client", () => {
		clientTypeTests(true /* isSummarizerClient */);
	});

	describe("Interactive client", () => {
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
