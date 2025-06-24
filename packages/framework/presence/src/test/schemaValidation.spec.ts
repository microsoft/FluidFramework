/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { toOpaqueJson } from "../internalUtils.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	attendeeId1,
	attendeeId2,
	connectionId1,
	connectionId2,
	createSpiedValidator,
	prepareConnectedPresence,
} from "./testUtils.js";

import type {
	Attendee,
	AttendeeId,
	InternalTypes,
	Latest,
	LatestData,
	LatestMap,
	ProxiedValueAccessor,
	StatesWorkspace,
} from "@fluidframework/presence/beta";
import { StateFactory } from "@fluidframework/presence/beta";

const systemWorkspace = {
	"system:presence": {
		"clientToSessionId": {
			[connectionId2]: { "rev": 0, "timestamp": 1010, "value": attendeeId2 },
		},
	},
};

interface TestData {
	num: number;
}

/**
 * Helper functions for creating test signals
 */
interface DatastoreUpdateSignalParams {
	clientId: string;
	sendTimestamp: number;
	avgLatency: number;
	workspaceData: Record<string, unknown>;
}

function createDatastoreUpdateSignal(params: DatastoreUpdateSignalParams) {
	return {
		type: "Pres:DatastoreUpdate" as const,
		clientId: params.clientId,
		content: {
			sendTimestamp: params.sendTimestamp,
			avgLatency: params.avgLatency,
			data: {
				...systemWorkspace,
				...params.workspaceData,
			},
		},
	};
}

interface StateWorkspaceSignalParams {
	/**
	 * The name of the state workspace.
	 */
	stateName: string;
	attendeeId: string;
	value: TestData;
	rev?: number;
	timestamp?: number;
}

function createStateWorkspaceSignal(params: StateWorkspaceSignalParams) {
	return {
		"s:name:testStateWorkspace": {
			[params.stateName]: {
				[params.attendeeId]: {
					rev: params.rev ?? 0,
					timestamp: params.timestamp ?? 1030,
					value: toOpaqueJson(params.value),
				},
			},
		},
	};
}

interface MapStateSignalParams extends StateWorkspaceSignalParams {
	/**
	 * The name of the state workspace.
	 */
	// stateName: string;
	// attendeeId: string;
	key: string;
	// value: TestData;
	// rev?: number;
	// timestamp?: number;
}

function createMapStateSignal(params: MapStateSignalParams) {
	return {
		"s:name:testStateWorkspace": {
			count: {
				[params.attendeeId]: {
					rev: params.rev ?? 0,
					items: {
						[params.key]: {
							rev: params.rev ?? 0,
							timestamp: params.timestamp ?? 1030,
							value: toOpaqueJson(params.value),
						},
					},
				},
			},
		},
	};
}

interface ValidatorTestParams {
	getRemoteValue: () => TestData | undefined;
	validatorFunction: ReturnType<typeof createSpiedValidator<TestData>>;
	expectedCallCount: number;
	expectedValue: TestData | undefined;
}

/**
 * Runs a test against a validator by getting the value and matching the resulting data and validator call counts
 * against expectations.
 */
function runValidatorTest(params: ValidatorTestParams): void {
	const initialValue = params.getRemoteValue();
	assert.deepEqual(initialValue, params.expectedValue);
	assert.equal(params.validatorFunction.callCount, params.expectedCallCount);
}

interface MultipleCallsTestParams {
	getRemoteValue: () => TestData | undefined;
	expectedValue: TestData | undefined;
	validatorFunction: ReturnType<typeof createSpiedValidator<TestData>>;
}

/**
 * Runs a test against a validator by getting the value multiple times and verifying that the validator is not called
 * multiple times.
 */
function runMultipleCallsTest(params: MultipleCallsTestParams): void {
	// First call should invoke validator
	const firstValue = params.getRemoteValue();
	assert.deepEqual(firstValue, params.expectedValue);
	assert.equal(params.validatorFunction.callCount, 1);

	// Subsequent calls should not invoke validator when data is unchanged
	const secondValue = params.getRemoteValue();
	const thirdValue = params.getRemoteValue();
	assert.deepEqual(secondValue, params.expectedValue);
	assert.deepEqual(thirdValue, params.expectedValue);
	assert.equal(params.validatorFunction.callCount, 1);
}

describe("Presence", () => {
	let attendee2: Attendee<AttendeeId>;

	describe.only("Runtime schema validation", () => {
		const afterCleanUp: (() => void)[] = [];
		const initialTime = 1000;
		const validatorFunction = createSpiedValidator<TestData>((d: unknown) => {
			return typeof d === "object" ? (d as TestData) : undefined;
		});

		let clock: SinonFakeTimers;
		let logger: EventAndErrorTrackingLogger;
		let presence: ReturnType<typeof createPresenceManager>;
		let runtime: MockEphemeralRuntime;

		before(async () => {
			clock = useFakeTimers();
		});

		beforeEach(() => {
			logger = new EventAndErrorTrackingLogger();
			runtime = new MockEphemeralRuntime(logger);
			clock.setSystemTime(initialTime);

			// Create a session and join attendee1
			presence = prepareConnectedPresence(runtime, attendeeId1, connectionId1, clock, logger);

			// Join attendee2 to the session. Tests will act as attendee2.
			presence = prepareConnectedPresence(runtime, attendeeId2, connectionId2, clock, logger);

			attendee2 = presence.attendees.getAttendee(attendeeId2);

			// Pass a little time (to mimic reality)
			clock.tick(10);
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
			let stateWorkspace: StatesWorkspace<{
				count: InternalTypes.ManagerFactory<
					string,
					InternalTypes.ValueRequiredState<{
						num: number;
					}>,
					Latest<TestData, ProxiedValueAccessor<TestData>>
				>;
			}>;

			beforeEach(() => {
				// Setup workspace initialization signal
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: 1030,
							avgLatency: 10,
							data: {
								...systemWorkspace,
								...createStateWorkspaceSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									value: { num: 0 },
								}),
							},
						},
					},
				]);

				stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 } satisfies TestData,
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});
			});

			describe("validator", () => {
				beforeEach(() => {
					// Process a valid update signal
					presence.processSignal(
						[],
						createDatastoreUpdateSignal({
							clientId: connectionId2,
							sendTimestamp: 1030,
							avgLatency: 10,
							workspaceData: createStateWorkspaceSignal({
								stateName: "count",
								attendeeId: attendeeId2,
								rev: 1,
								value: { num: 11 },
							}),
						}),
						false,
					);
				});

				describe("is not called", () => {
					it("by .getRemote()", () => {
						// Calling getRemote should not invoke the validator (only a value read will).
						stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(validatorFunction.callCount, 0);
					});

					it("when accessing .local", () => {
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId1,
								sendTimestamp: 1030,
								avgLatency: 10,
								workspaceData: createStateWorkspaceSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									rev: 1,
									value: { num: 33 },
								}),
							}),
							false,
						);
						assert.equal(validatorFunction.callCount, 0, "initial call count is wrong");
						assert.equal(stateWorkspace.states.count.local.num, 0);
						assert.equal(validatorFunction.callCount, 0, "validator was called on local data");
					});
				});

				describe("is called", () => {
					it("on first value() call", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						runValidatorTest({
							getRemoteValue: () => remoteData.value(),
							expectedCallCount: 1,
							expectedValue: { num: 11 },
							validatorFunction,
						});
					});

					it("only once for multiple value() calls on unchanged data", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						runMultipleCallsTest({
							getRemoteValue: () => remoteData.value(),
							expectedValue: { num: 11 },
							validatorFunction,
						});
					});

					it("when remote data has changed", () => {
						// Get the remote data and read it, verify that the validator is called once.
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(remoteData.value()?.num, 11);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send updated data from remote client
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1040,
								avgLatency: 10,
								workspaceData: createStateWorkspaceSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									value: { num: 22 },
									rev: 2,
								}),
							}),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time since the data has been
						// changed.
						const data2 = stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(data2.value()?.num, 22, "updated remote value is wrong");
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("when remote data changes from valid to invalid", () => {
						// Get the remote data and read it, verify that the validator is called once.
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(remoteData.value()?.num, 11);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send invalid data from remote client
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1040,
								avgLatency: 10,
								workspaceData: createStateWorkspaceSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									value: "invalid" as unknown as TestData,
									rev: 2,
								}),
							}),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and return undefined
						const data2 = stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(data2.value(), undefined, "invalid data should return undefined");
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("when remote data changes from invalid to valid", () => {
						// First send invalid data
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1030,
								avgLatency: 10,
								workspaceData: createStateWorkspaceSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									value: "invalid" as unknown as TestData,
									rev: 2,
								}),
							}),
							false,
						);

						// Get the remote data and read it, verify that the validator is called once and returns undefined
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(remoteData.value(), undefined);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send valid data from remote client
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1040,
								avgLatency: 10,
								workspaceData: createStateWorkspaceSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									value: { num: 33 },
									rev: 3,
								}),
							}),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and return valid data
						const data2 = stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(data2.value()?.num, 33, "valid data should be returned");
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("when remote data changes from invalid to invalid", () => {
						// First send invalid data
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1030,
								avgLatency: 10,
								workspaceData: createStateWorkspaceSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									value: "invalid1" as unknown as TestData,
									rev: 2,
								}),
							}),
							false,
						);

						// Get the remote data and read it, verify that the validator is called once and returns undefined
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(remoteData.value(), undefined);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send different invalid data from remote client
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1040,
								avgLatency: 10,
								workspaceData: createStateWorkspaceSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									value: "invalid2" as unknown as TestData,
									rev: 3,
								}),
							}),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and still return undefined
						const data2 = stateWorkspace.states.count.getRemote(attendee2);
						assert.equal(data2.value(), undefined, "invalid data should return undefined");
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});
				});

				it("returns undefined when remote data is invalid", () => {
					// Send invalid data
					presence.processSignal(
						[],
						createDatastoreUpdateSignal({
							clientId: connectionId2,
							sendTimestamp: 1030,
							avgLatency: 10,
							workspaceData: createStateWorkspaceSignal({
								stateName: "count",
								attendeeId: attendeeId2,
								value: "string" as unknown as TestData,
								rev: 2,
							}),
						}),
						false,
					);

					const remoteData = stateWorkspace.states.count.getRemote(attendee2);

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

		describe("LatestMapValueManager", () => {
			let stateWorkspace: StatesWorkspace<{
				count: InternalTypes.ManagerFactory<
					string,
					InternalTypes.MapValueState<TestData, "key1">,
					LatestMap<TestData, "key1", ProxiedValueAccessor<TestData>>
				>;
			}>;

			beforeEach(() => {
				// Add expected workspace initialization signal
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: 1030,
							avgLatency: 10,
							data: {
								...systemWorkspace,
								...createMapStateSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									key: "key1",
									value: { num: 0 },
								}),
							},
						},
					},
				]);

				// initialize the state workspace, which will process the signal above.
				stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { "key1": { num: 0 } },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				// Process signal with new value
				presence.processSignal(
					[],
					createDatastoreUpdateSignal({
						clientId: connectionId2,
						sendTimestamp: 1030,
						avgLatency: 10,
						workspaceData: createMapStateSignal({
							stateName: "count",
							attendeeId: attendeeId2,
							key: "key1",
							value: { num: 84 },
							rev: 1,
						}),
					}),
					false,
				);
			});

			describe("validator", () => {
				describe("is not called", () => {
					it("when accessing local key value", () => {
						assert.equal(stateWorkspace.states.count.local.get("key1")?.num, 84);
						assert.equal(validatorFunction.callCount, 0);
					});

					it("when calling get() on remote map", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						remoteData.get("key1");
						assert.equal(validatorFunction.callCount, 0);
					});
				});

				describe("is called", () => {
					it("once when key.value() is called", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						runValidatorTest({
							getRemoteValue: () => remoteData.get("key1")?.value(),
							expectedCallCount: 1,
							expectedValue: { num: 84 },
							validatorFunction,
						});
					});

					it("when a key value is read", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						const key = remoteData.get("key1");
						assert.equal(key?.value()?.num, 84);
						assert.equal(validatorFunction.callCount, 1, "call count is wrong");
					});

					it("when remote key data has changed", () => {
						// Get the remote data and read it, verify that the validator is called once.
						assert.equal(
							stateWorkspace.states.count.getRemote(attendee2).get("key1")?.value()?.num,
							84,
						);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send updated key data from remote client
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1040,
								avgLatency: 10,
								workspaceData: createMapStateSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									key: "key1",
									value: { num: 22 },
									rev: 2,
								}),
							}),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time since the data has been
						// changed.
						assert.equal(
							stateWorkspace.states.count.getRemote(attendee2).get("key1")?.value()?.num,
							22,
							"updated remote key value is wrong",
						);
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("only once for multiple key.value() calls on unchanged data", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						runMultipleCallsTest({
							getRemoteValue: () => remoteData.get("key1")?.value(),
							expectedValue: { num: 84 },
							validatorFunction,
						});
					});

					it("when remote key data changes from valid to invalid", () => {
						// Get the remote data and read it, verify that the validator is called once.
						assert.equal(
							stateWorkspace.states.count.getRemote(attendee2).get("key1")?.value()?.num,
							84,
						);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send invalid key data from remote client
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1040,
								avgLatency: 10,
								workspaceData: createMapStateSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									key: "key1",
									value: "invalid" as unknown as TestData,
									rev: 2,
								}),
							}),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and return undefined
						assert.equal(
							stateWorkspace.states.count.getRemote(attendee2).get("key1")?.value(),
							undefined,
							"invalid key data should return undefined",
						);
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("when remote key data changes from invalid to valid", () => {
						// First send invalid key data
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1030,
								avgLatency: 10,
								workspaceData: createMapStateSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									key: "key1",
									value: "invalid" as unknown as TestData,
									rev: 2,
								}),
							}),
							false,
						);

						// Get the remote data and read it, verify that the validator is called once and returns undefined
						assert.equal(
							stateWorkspace.states.count.getRemote(attendee2).get("key1")?.value(),
							undefined,
						);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send valid key data from remote client
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1040,
								avgLatency: 10,
								workspaceData: createMapStateSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									key: "key1",
									value: { num: 55 },
									rev: 3,
								}),
							}),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and return valid data
						assert.equal(
							stateWorkspace.states.count.getRemote(attendee2).get("key1")?.value()?.num,
							55,
							"valid key data should be returned",
						);
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});

					it("when remote key data changes from invalid to invalid", () => {
						// First send invalid key data
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1030,
								avgLatency: 10,
								workspaceData: createMapStateSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									key: "key1",
									value: "invalid1" as unknown as TestData,
									rev: 2,
								}),
							}),
							false,
						);

						// Get the remote data and read it, verify that the validator is called once and returns undefined
						assert.equal(
							stateWorkspace.states.count.getRemote(attendee2).get("key1")?.value(),
							undefined,
						);
						assert.equal(validatorFunction.callCount, 1, "first call count is wrong");

						// Send different invalid key data from remote client
						presence.processSignal(
							[],
							createDatastoreUpdateSignal({
								clientId: connectionId2,
								sendTimestamp: 1040,
								avgLatency: 10,
								workspaceData: createMapStateSignal({
									stateName: "count",
									attendeeId: attendeeId2,
									key: "key1",
									value: "invalid2" as unknown as TestData,
									rev: 3,
								}),
							}),
							false,
						);

						// Reading the remote value should cause the validator to be called a second time and still return undefined
						assert.equal(
							stateWorkspace.states.count.getRemote(attendee2).get("key1")?.value(),
							undefined,
							"invalid key data should return undefined",
						);
						assert.equal(validatorFunction.callCount, 2, "validator should be called twice");
					});
				});
			});
		});
	});
});
