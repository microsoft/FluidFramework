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
import { MockEphemeralRuntime } from "../mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	attendeeId1,
	attendeeId2,
	connectionId1,
	connectionId2,
	createSpiedValidator,
	prepareConnectedPresence,
} from "../testUtils.js";

import type {
	Attendee,
	InternalTypes,
	Latest,
	ProxiedValueAccessor,
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
		"client1": {
			"rev": 0,
			"timestamp": 0,
			"value": attendeeId1,
		},
	},
} as const;
const latestUpdate = {
	"latest": {
		[attendeeId1]: {
			"rev": 1,
			"timestamp": 0,
			"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
		},
	},
} as const;

interface TestData {
	num: number;
}

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
					clientId: "client1",
				},
				false,
			);
		}

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

			// Create Presence joining session as attendeeId-2.
			presence = prepareConnectedPresence(runtime, attendeeId2, connectionId2, clock, logger);

			// Attendee 2 is self.
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
					createExpectedStateUpdateSignal(connectionId2, "count", attendeeId2, {
						num: 0,
					}),
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
						createStateUpdateSignal(connectionId2, "count", attendeeId2, { num: 11 }, 1),
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
							createStateUpdateSignal(connectionId1, "count", attendeeId2, { num: 33 }, 1),
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
						const data2 = stateWorkspace.states.count.getRemote(attendee2);
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
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
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
						const data2 = stateWorkspace.states.count.getRemote(attendee2);
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
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
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
						const data2 = stateWorkspace.states.count.getRemote(attendee2);
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
	});
});
