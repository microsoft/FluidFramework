/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { toOpaqueJson } from "../../internalUtils.js";
import type { createPresenceManager } from "../../presenceManager.js";
import type { OutboundDatastoreUpdateMessage } from "../../protocol.js";
import { MockEphemeralRuntime } from "../mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	attendeeId1,
	attendeeId2,
	connectionId1,
	connectionId2,
	createSpiedValidator,
	generateBasicClientJoin,
	prepareConnectedPresence,
} from "../testUtils.js";

import type { MapValue, TestData } from "./helpers.js";
import { runMultipleCallsTest, runValidatorTest } from "./helpers.js";

import type {
	Attendee,
	InternalTypes,
	Latest,
	LatestMap,
	LatestMapRaw,
	ProxiedValueAccessor,
	RawValueAccessor,
	StatesWorkspace,
} from "@fluidframework/presence/beta";
import { StateFactory } from "@fluidframework/presence/beta";

const systemWorkspace = {
	"system:presence": {
		"clientToSessionId": {
			[connectionId2]: { "rev": 0, "timestamp": 1000, "value": attendeeId2 },
		},
	},
};

/**
 * Workspace updates
 */

const attendeeUpdate = {
	"clientToSessionId": {
		[connectionId1]: {
			"rev": 0,
			"timestamp": 0,
			"value": attendeeId1,
		},
	},
} as const;
const latestUpdate = {
	"latest": {
		[attendeeId2]: {
			"rev": 1,
			"timestamp": 0,
			"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
		},
	},
} as const;

/**
 * Focused helper functions for creating test signals
 */

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createStateData(attendeeId: string, value: TestData, rev = 0, timestamp = 1030) {
	return {
		[attendeeId]: {
			rev,
			timestamp,
			value: toOpaqueJson(value),
		},
	};
}

function createWorkspaceData(
	stateName: string,
	stateData: Record<string, unknown>,
): { "s:name:testStateWorkspace": { [x: string]: Record<string, unknown> } } {
	return {
		"s:name:testStateWorkspace": {
			[stateName]: stateData,
		},
	};
}

// Signal creation helpers
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createDatastoreSignal(
	clientId: string,
	workspaceData: Record<string, unknown>,
	timestamp = 1030,
) {
	return {
		type: "Pres:DatastoreUpdate" as const,
		clientId,
		content: {
			sendTimestamp: timestamp,
			avgLatency: 10,
			data: {
				...systemWorkspace,
				...workspaceData,
			},
		},
	};
}

// Helper for creating signals that would be submitted by the runtime (no clientId)
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createExpectedDatastoreSignal(
	clientId: string,
	workspaceData: Record<string, unknown>,
	timestamp = 1030,
) {
	return {
		type: "Pres:DatastoreUpdate" as const,
		content: {
			sendTimestamp: timestamp,
			avgLatency: 10,
			data: {
				...systemWorkspace,
				...workspaceData,
			},
		},
	};
}

// Convenience functions for common patterns
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createStateUpdateSignal(
	clientId: string,
	stateName: string,
	attendeeId: string,
	value: TestData,
	rev = 0,
	timestamp = 1030,
) {
	const stateData = createStateData(attendeeId, value, rev, timestamp);
	const workspaceData = createWorkspaceData(stateName, stateData);
	return createDatastoreSignal(clientId, workspaceData, timestamp);
}

// Convenience functions for expected signals (no clientId)
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createExpectedStateUpdateSignal(
	clientId: string,
	stateName: string,
	attendeeId: string,
	value: TestData,
	rev = 0,
	timestamp = 1030,
) {
	const stateData = createStateData(attendeeId, value, rev, timestamp);
	const workspaceData = createWorkspaceData(stateName, stateData);
	return createExpectedDatastoreSignal(clientId, workspaceData, timestamp);
}

describe.only("Presence", () => {
	let attendee2: Attendee;

	describe("Runtime schema validation", () => {
		const afterCleanUp: (() => void)[] = [];
		const initialTime = 1000;
		const validatorFunction = createSpiedValidator<TestData>((d: unknown) => {
			return typeof d === "object" ? (d as TestData) : undefined;
		});

		function processUpdates(valueManagerUpdates: Record<string, typeof latestUpdate>): void {
			const updates = { "system:presence": attendeeUpdate, ...valueManagerUpdates };

			presence.processSignal(
				[],
				{
					type: "Pres:DatastoreUpdate",
					content: {
						sendTimestamp: clock.now - 10,
						avgLatency: 20,
						data: updates,
					},
					clientId: connectionId1,
				},
				false,
			);
		}

		let clock: SinonFakeTimers;
		let logger: EventAndErrorTrackingLogger;
		let presence: ReturnType<typeof createPresenceManager>;
		let runtime: MockEphemeralRuntime;

		let stateWorkspace: StatesWorkspace<{
			latest: InternalTypes.ManagerFactory<
				string,
				InternalTypes.ValueRequiredState<TestData>,
				Latest<TestData, ProxiedValueAccessor<TestData>>
			>;

			latestMap: InternalTypes.ManagerFactory<
				string,
				InternalTypes.MapValueState<TestData, "key1" | "key2">,
				LatestMap<MapValue, "key1" | "key2", RawValueAccessor<MapValue>>
			>;
		}>;

		before(async () => {
			clock = useFakeTimers();
		});

		beforeEach(() => {
			logger = new EventAndErrorTrackingLogger();
			runtime = new MockEphemeralRuntime(logger);
			clock.setSystemTime(initialTime);

			// Attendee 1 is self.
			// Create Presence joining session as attendeeId-1.
			presence = prepareConnectedPresence(runtime, attendeeId1, connectionId1, clock, logger);

			const newAttendeeSignal = generateBasicClientJoin(clock.now - 50, {
				averageLatency: 50,
				attendeeId: attendeeId2,
				clientConnectionId: connectionId2,
				updateProviders: [connectionId1],
			});
			const expectedSetupJoinResponse = {
				type: "Pres:DatastoreUpdate",
				content: {
					"avgLatency": 10,
					"data": {
						"system:presence": {
							// Original response does not contain the requestor (attendeeId-4)
							// information (for efficiency). Note that the efficiency might be
							// compromising robust data and may change.
							"clientToSessionId": {
								[connectionId2]: {
									"rev": 0,
									"timestamp": initialTime,
									"value": attendeeId2,
								},
								[connectionId1]: {
									"rev": 0,
									"timestamp": 0,
									"value": attendeeId1,
								},
							},
						},
						"s:name:testWorkspace": {
							"latest": {
								[attendeeId1]: {
									"rev": 1,
									"timestamp": -20,
									"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
								},
							},
							"latestMap": {
								[attendeeId1]: {
									"rev": 1,
									"items": {
										"key1": {
											"rev": 1,
											"timestamp": -20,
											"value": toOpaqueJson({ a: 1, b: 1 }),
										},
										"key2": {
											"rev": 1,
											"timestamp": -20,
											"value": toOpaqueJson({ b: 1, d: 1 }),
										},
									},
								},
							},
						},
					},
					"isComplete": true,
					"sendTimestamp": clock.now,
				},
			} as const satisfies OutboundDatastoreUpdateMessage;

			{
				runtime.signalsExpected.push([expectedSetupJoinResponse]);
				presence.processSignal([], newAttendeeSignal, false);
			}
			// Pass a little time (to distinguish between signals)
			clock.tick(10);

			// Attendee 2 is remote attendee.
			attendee2 = presence.attendees.getAttendee(attendeeId2);

			// Pass a little time (to mimic reality)
			clock.tick(10);

			// Process remote client update signal (attendeeId-1 is then part of local client's known session).
			const workspace = {
				"s:name:testWorkspace": {
					...latestUpdate,
				},
			};
			processUpdates(workspace);

			// Pass a little time (to mimic reality)
			clock.tick(10);

			stateWorkspace = presence.states.getWorkspace("name:testWorkspace", {
				latest: StateFactory.latest({ local: { num: 0 }, validator: validatorFunction }),
				latestMap: StateFactory.latestMap({
					local: {
						key1: { a: 0, b: 0 },
						key2: { c: 0, d: 0 },
					},
				}),
			});
		});

		afterEach(function (done: Mocha.Done) {
			clock.reset();
			validatorFunction.resetHistory();

			// If the test passed so far, check final expectations.
			if (this.currentTest?.state === "passed") {
				assertFinalExpectations(runtime, logger);
			}

			for (const cleanUp of afterCleanUp) {
				cleanUp();
			}
			afterCleanUp.length = 0;
			done();
		});

		after(() => {
			clock.restore();
		});

		describe("LatestValueManager", () => {
			beforeEach(() => {
				// Setup workspace initialization signal
				// runtime.signalsExpected.push([
				// 	createExpectedStateUpdateSignal(connectionId2, "count", attendeeId2, {
				// 		num: 0,
				// 	}),
				// ]);
				// stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
				// 	count: StateFactory.latest({
				// 		local: { num: 0 } satisfies TestData,
				// 		validator: validatorFunction,
				// 		settings: { allowableUpdateLatencyMs: 0 },
				// 	}),
				// });
			});

			describe("validator", () => {
				beforeEach(() => {
					// Process a valid update signal
					presence.processSignal(
						[],
						createStateUpdateSignal(connectionId2, "count", attendeeId2, { num: 11 }, 1),
						false,
					);
				});

				describe("is not called", () => {
					it("by .getRemote()", () => {
						// Calling getRemote should not invoke the validator (only a value read will).
						stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(validatorFunction.callCount, 0);
					});

					it("when accessing .local", () => {
						presence.processSignal(
							[],
							createStateUpdateSignal(connectionId1, "count", attendeeId2, { num: 33 }, 1),
							false,
						);
						assert.equal(validatorFunction.callCount, 0, "initial call count is wrong");
						assert.equal(stateWorkspace.states.latest.local.num, 0);
						assert.equal(validatorFunction.callCount, 0, "validator was called on local data");
					});
				});

				describe("is called", () => {
					it("on first value() call", () => {
						const remoteData = stateWorkspace.states.latest.getRemote(attendee2);
						runValidatorTest({
							getRemoteValue: () => remoteData.value(),
							expectedCallCount: 1,
							expectedValue: { num: 11 },
							validatorFunction,
						});
					});

					it("only once for multiple value() calls on unchanged data", () => {
						const remoteData = stateWorkspace.states.latest.getRemote(attendee2);
						runMultipleCallsTest({
							getRemoteValue: () => remoteData.value(),
							expectedValue: { num: 11 },
							validatorFunction,
						});
					});

					it("when remote data has changed", () => {
						// Get the remote data and read it, verify that the validator is called once.
						const remoteData = stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(remoteData.value()?.num, 11);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send updated data from remote client
						presence.processSignal(
							[],
							createStateUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								{ num: 22 },
								2,
								1040,
							),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time since the data has been
						// changed.
						const data2 = stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(data2.value()?.num, 22, "updated remote value is wrong");
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("when remote data changes from valid to invalid", () => {
						// Get the remote data and read it, verify that the validator is called once.
						const remoteData = stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(remoteData.value()?.num, 11);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send invalid data from remote client
						presence.processSignal(
							[],
							createStateUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"invalid" as unknown as TestData,
								2,
								1040,
							),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and return undefined
						const data2 = stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(data2.value(), undefined, "invalid data should return undefined");
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("when remote data changes from invalid to valid", () => {
						// First send invalid data
						presence.processSignal(
							[],
							createStateUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"invalid" as unknown as TestData,
								2,
							),
							false,
						);

						// Get the remote data and read it, verify that the validator is called once and returns undefined
						const remoteData = stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(remoteData.value(), undefined);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send valid data from remote client
						presence.processSignal(
							[],
							createStateUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								{ num: 33 },
								3,
								1040,
							),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and return valid data
						const data2 = stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(data2.value()?.num, 33, "valid data should be returned");
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("when remote data changes from invalid to invalid", () => {
						// First send invalid data
						presence.processSignal(
							[],
							createStateUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"invalid1" as unknown as TestData,
								2,
							),
							false,
						);

						// Get the remote data and read it, verify that the validator is called once and returns undefined
						const remoteData = stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(remoteData.value(), undefined);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send different invalid data from remote client
						presence.processSignal(
							[],
							createStateUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"invalid2" as unknown as TestData,
								3,
								1040,
							),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and still return undefined
						const data2 = stateWorkspace.states.latest.getRemote(attendee2);
						assert.equal(data2.value(), undefined, "invalid data should return undefined");
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});
				});

				it("returns undefined when remote data is invalid", () => {
					// Send invalid data
					presence.processSignal(
						[],
						createStateUpdateSignal(
							connectionId2,
							"count",
							attendeeId2,
							"string" as unknown as TestData,
							2,
						),
						false,
					);

					const remoteData = stateWorkspace.states.latest.getRemote(attendee2);

					// Validator should not be called initially
					assert.equal(
						validatorFunction.callCount,
						0,
						"validator should not be called initially",
					);

					// First value() call should invoke validator and return undefined
					assert.equal(remoteData.value(), undefined);
					assert.equal(validatorFunction.callCount, 1, "validator should be called once");

					// Subsequent calls should not invoke validator again
					remoteData.value();
					assert.equal(
						validatorFunction.callCount,
						1,
						"validator should still be called only once",
					);
				});
			});
		});
	});
});
