/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import {
	MockLogger,
	TelemetryDataTag,
	ConfigTypes,
	IConfigProviderBase,
	mixinMonitoringContext,
	MonitoringContext,
	ChildLogger,
} from "@fluidframework/telemetry-utils";
import {
	GCNodeType,
	GCTelemetryTracker,
	defaultSessionExpiryDurationMs,
	oneDayMs,
	disableSweepLogKey,
	UnreferencedStateTracker,
} from "../../gc";
import { pkgVersion } from "../../packageVersion";

export const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

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
		const getNodeType = (nodePath: string) => {
			if (nodePath.split("/").length !== 2) {
				return GCNodeType.Other;
			}
			return GCNodeType.DataStore;
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
	function updateNodes(nodeIds: string[]) {
		nodeIds.forEach((nodeId) => {
			telemetryTracker.nodeUsed({
				nodeId,
				usageType: "Changed",
				currentReferenceTimestampMs: Date.now(),
				packagePath: testPkgPath,
				completedGCRuns: 0,
				isTombstoned: false,
			});
			telemetryTracker.nodeUsed({
				nodeId,
				usageType: "Loaded",
				currentReferenceTimestampMs: Date.now(),
				packagePath: testPkgPath,
				completedGCRuns: 0,
				isTombstoned: false,
			});
		});
	}

	function reviveNode(fromId: string, toId: string) {
		telemetryTracker.nodeUsed({
			nodeId: toId,
			usageType: "Revived",
			currentReferenceTimestampMs: Date.now(),
			packagePath: testPkgPath,
			completedGCRuns: 0,
			isTombstoned: false,
			fromId,
		});
		unreferencedNodesState.delete(toId);
	}

	async function logAllEvents(isSummarizerClient: boolean) {
		if (!isSummarizerClient) {
			return;
		}
		telemetryTracker.logSweepEvents(mc.logger, Date.now(), unreferencedNodesState, 0);
		await telemetryTracker.logUnreferencedEvents(mc.logger);
	}

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		mockLogger = new MockLogger();
		mc = mixinMonitoringContext(
			ChildLogger.create(mockLogger, "GarbageCollector"),
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

	const tests = (isSummarizerClient: boolean) => {
		function filterEvents(events: Omit<ITelemetryBaseEvent, "category">[]) {
			const filteredEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
			for (const event of events) {
				const eventName = event.eventName as string;
				if (!isSummarizerClient && !eventName.includes("Loaded")) {
					continue;
				}
				filteredEvents.push(event);
			}
			return filteredEvents;
		}

		function assertMatchEvents(
			expectedEvents: Omit<ITelemetryBaseEvent, "category">[],
			message: string,
		) {
			const filteredEvents = filterEvents(expectedEvents);
			mockLogger.assertMatch(filteredEvents, message);
		}

		it("generates both inactive and sweep ready events when nodes are used after time out", async () => {
			telemetryTracker = createTelemetryTracker(true /* enable Sweep */, isSummarizerClient);
			markNodesUnreferenced([nodes[2], nodes[3]]);

			// Advance the clock to trigger inactive timeout and validate that we get inactive events.
			clock.tick(inactiveTimeoutMs + 1);
			updateNodes(nodes);
			await logAllEvents(isSummarizerClient);
			assertMatchEvents(
				[
					{
						eventName: "GarbageCollector:InactiveObject_Changed",
						timeout: inactiveTimeoutMs,
						id: nodes[2],
					},
					{
						eventName: "GarbageCollector:InactiveObject_Loaded",
						timeout: inactiveTimeoutMs,
						id: nodes[2],
					},
					{
						eventName: "GarbageCollector:InactiveObject_Changed",
						timeout: inactiveTimeoutMs,
						id: nodes[3],
					},
					{
						eventName: "GarbageCollector:InactiveObject_Loaded",
						timeout: inactiveTimeoutMs,
						id: nodes[3],
					},
				],
				"inactive events not as expected",
			);

			// Advance the clock to trigger sweep timeout and validate that we get sweep ready events.
			clock.tick(sweepTimeoutMs - inactiveTimeoutMs);
			updateNodes(nodes);
			await logAllEvents(isSummarizerClient);
			assertMatchEvents(
				[
					{
						eventName: "GarbageCollector:SweepReadyObject_Changed",
						timeout: sweepTimeoutMs,
						id: nodes[2],
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Loaded",
						timeout: sweepTimeoutMs,
						id: nodes[2],
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Changed",
						timeout: sweepTimeoutMs,
						id: nodes[3],
					},
					{
						eventName: "GarbageCollector:SweepReadyObject_Loaded",
						timeout: sweepTimeoutMs,
						id: nodes[3],
					},
				],
				"sweep ready events not as expected",
			);
		});

		const individualEventTests = (
			timeout: number,
			mode: "inactive" | "sweep",
			revivedEventName: string,
			changedEventName: string,
			loadedEventName: string,
			expectDeleteLogs?: boolean,
		) => {
			const deleteEventName = "GarbageCollector:GCObjectDeleted";
			// Validates that no unexpected event has been fired.
			function validateNoUnexpectedEvents() {
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
					mode === "sweep" ? true : false,
					isSummarizerClient,
				);
			});

			it("doesn't generate events for referenced nodes", async () => {
				updateNodes(nodes);
				await logAllEvents(isSummarizerClient);
				validateNoUnexpectedEvents();

				clock.tick(timeout - 1);
				updateNodes(nodes);
				await logAllEvents(isSummarizerClient);
				validateNoUnexpectedEvents();

				// Advance the clock to expire the timeout.
				clock.tick(1);

				// Update all nodes again. Validate that no unexpected events are generated since everything is referenced.
				updateNodes(nodes);
				await logAllEvents(isSummarizerClient);
				validateNoUnexpectedEvents();
			});

			it("generates events for nodes that are used after inactive / sweep ready", async () => {
				markNodesUnreferenced([nodes[1], nodes[2]]);

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				updateNodes(nodes);
				await logAllEvents(isSummarizerClient);
				validateNoUnexpectedEvents();

				// Expire the timeout and validate that all events for node 1 and node 2 are logged.
				clock.tick(1);
				updateNodes(nodes);
				await logAllEvents(isSummarizerClient);

				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				if (expectDeleteLogs && isSummarizerClient) {
					expectedEvents.push(
						{ eventName: deleteEventName, timeout, id: nodes[1] },
						{ eventName: deleteEventName, timeout, id: nodes[2] },
					);
				} else {
					assert(
						!mockLogger.events.some((event) => event.eventName === deleteEventName),
						"Should not have any delete events logged",
					);
				}
				expectedEvents.push(
					{
						eventName: changedEventName,
						timeout,
						id: nodes[1],
						pkg: eventPkg,
						createContainerRuntimeVersion: pkgVersion,
					},
					{
						eventName: loadedEventName,
						timeout,
						id: nodes[1],
						pkg: eventPkg,
						createContainerRuntimeVersion: pkgVersion,
					},
					{
						eventName: changedEventName,
						timeout,
						id: nodes[2],
						pkg: eventPkg,
						createContainerRuntimeVersion: pkgVersion,
					},
					{
						eventName: loadedEventName,
						timeout,
						id: nodes[2],
						pkg: eventPkg,
						createContainerRuntimeVersion: pkgVersion,
					},
				);
				assertMatchEvents(expectedEvents, "all events not as expected");

				reviveNode(nodes[0], nodes[2]);
				await logAllEvents(isSummarizerClient);
				assertMatchEvents(
					[
						{
							eventName: revivedEventName,
							timeout,
							id: nodes[2],
							pkg: eventPkg,
							fromId: nodes[0],
						},
					],
					"revived event not as expected",
				);
			});

			it("generates events once per node", async () => {
				// Remove node 3's reference from node 2.
				markNodesUnreferenced([nodes[2]]);
				await logAllEvents(isSummarizerClient);

				// Advance the clock just before the timeout and validate no unexpected events are logged.
				clock.tick(timeout - 1);
				updateNodes(nodes);
				await logAllEvents(isSummarizerClient);
				validateNoUnexpectedEvents();

				// Expire the timeout and validate that all events for node 3 are logged.
				clock.tick(1);
				updateNodes(nodes);
				await logAllEvents(isSummarizerClient);
				const expectedEvents: Omit<ITelemetryBaseEvent, "category">[] = [];
				if (expectDeleteLogs && isSummarizerClient) {
					expectedEvents.push({ eventName: deleteEventName, timeout, id: nodes[2] });
				} else {
					assert(
						!mockLogger.events.some((event) => event.eventName === deleteEventName),
						"Should not have any delete events logged",
					);
				}
				expectedEvents.push(
					{ eventName: changedEventName, timeout, id: nodes[2], pkg: eventPkg },
					{ eventName: loadedEventName, timeout, id: nodes[2], pkg: eventPkg },
				);
				assertMatchEvents(expectedEvents, "all events not as expected");

				// Update all nodes again. There shouldn't be any more events since for each node the event is only once.
				updateNodes(nodes);
				await logAllEvents(isSummarizerClient);
				validateNoUnexpectedEvents();
			});

			if (isSummarizerClient) {
				it("generates only revived event in summarizer when an inactive node is updated and revived", async () => {
					markNodesUnreferenced([nodes[2]]);

					// Advance the clock just before the timeout and validate no unexpected events are logged.
					clock.tick(timeout - 1);
					updateNodes(nodes);
					await logAllEvents(isSummarizerClient);

					validateNoUnexpectedEvents();

					// Expire the timeout and validate that only revived event is generated for node 2.
					clock.tick(1);
					updateNodes([nodes[2]]);
					reviveNode(nodes[1], nodes[2]);
					await logAllEvents(isSummarizerClient);

					for (const event of mockLogger.events) {
						assert.notStrictEqual(
							event.eventName,
							changedEventName,
							"Unexpected changed event logged",
						);
						assert.notStrictEqual(
							event.eventName,
							loadedEventName,
							"Unexpected loaded event logged",
						);
					}
					assertMatchEvents(
						[
							{
								eventName: revivedEventName,
								timeout,
								id: nodes[2],
								pkg: eventPkg,
								fromId: nodes[1],
							},
						],
						"revived event not as expected",
					);
				});
			}
		};

		describe("Inactive events", () => {
			individualEventTests(
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

			individualEventTests(
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
				individualEventTests(
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

	describe("Summarizer container", () => {
		tests(true);
	});

	describe("Interactive container", () => {
		tests(false);
	});
});
