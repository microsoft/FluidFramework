/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { InboundExtensionMessage } from "@fluidframework/container-runtime-definitions/internal";
import type { OpaqueJsonDeserialized } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { toOpaqueJson } from "../../internalUtils.js";
import type { createPresenceManager } from "../../presenceManager.js";
import { SignalMessages } from "../../protocol.js";
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

import type { Attendee, Latest } from "@fluidframework/presence/beta";
import { StateFactory } from "@fluidframework/presence/beta";

/**
 * Workspace updates
 */
interface Point3D {
	x: number;
	y: number;
	z: number;
}

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
		[attendeeId1]: {
			"rev": 1,
			"timestamp": 0,
			"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
		},
	},
} as const;
const latestMapUpdate = {
	"latestMap": {
		[attendeeId1]: {
			"rev": 1,
			"items": {
				"key1": {
					"rev": 1,
					"timestamp": 0,
					"value": toOpaqueJson({ a: 1, b: 1 }),
				},
				"key2": {
					"rev": 1,
					"timestamp": 0,
					// out of schema value
					"value": toOpaqueJson({ b: 1, d: 1 }),
				},
			},
		},
	},
} as const;

function datastoreUpdateSignal(
	clock: SinonFakeTimers,
	metadata: {
		"rev": number;
		"timestamp": number;
		"value": OpaqueJsonDeserialized<unknown>;
	},
): InboundExtensionMessage<SignalMessages> {
	return {
		type: "Pres:DatastoreUpdate",
		content: {
			sendTimestamp: clock.now - 10,
			avgLatency: 20,
			data: {
				"system:presence": attendeeUpdate,
				"s:name:testWorkspace": {
					"latest": {
						[attendeeId1]: metadata,
					},
				},
			},
		},
		clientId: connectionId1,
	};
}

interface ValidatorTestParams {
	getRemoteValue: () => Point3D | undefined;
	validatorFunction: ReturnType<typeof createSpiedValidator<Point3D>>;
	expectedCallCount: number;
	expectedValue: Point3D | undefined;
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
	getRemoteValue: () => Point3D | undefined;
	expectedValue: Point3D | undefined;
	validatorFunction: ReturnType<typeof createSpiedValidator<Point3D>>;
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
	describe("Runtime schema validation", () => {
		const afterCleanUp: (() => void)[] = [];
		const initialTime = 1000;

		type UpdateContent = typeof latestUpdate & typeof latestMapUpdate;

		function processUpdates(valueManagerUpdates: Record<string, UpdateContent>): void {
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
		let remoteAttendee: Attendee;
		let point3DValidatorFunction: ReturnType<typeof createSpiedValidator<Point3D>>;

		before(async () => {
			clock = useFakeTimers();
		});

		/**
		 * This beforeEach sets up the runtime and presence objects. The `presence` object is owned by attendee2, while
		 * attendee1 acts as a remote attendee for the purposes of the tests.
		 */
		beforeEach(() => {
			logger = new EventAndErrorTrackingLogger();
			runtime = new MockEphemeralRuntime(logger);
			clock.setSystemTime(initialTime);
			point3DValidatorFunction = createSpiedValidator<Point3D>((d: unknown) => {
				return typeof d === "object" ? (d as Point3D) : undefined;
			});

			// Create Presence joining session as attendeeId-2. Tests will act as attendee2
			presence = prepareConnectedPresence(runtime, attendeeId2, connectionId2, clock, logger);

			// Pass a little time (to mimic reality)
			clock.tick(10);

			// Process remote client update signal (attendeeId-1 is then part of local client's known session).
			processUpdates({
				"s:name:testWorkspace": { ...latestUpdate, ...latestMapUpdate },
			});

			// Pass a little time (to mimic reality)
			clock.tick(10);

			// Get attendee references
			remoteAttendee = presence.attendees.getAttendee(attendeeId1);
		});

		afterEach(function (done: Mocha.Done) {
			clock.reset();
			point3DValidatorFunction.resetHistory();

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

		describe("validator", () => {
			let latest: Latest<Point3D>;

			/**
			 * This beforeEach sets up the presence workspace itself and gets a reference to it. It then sets some new data as
			 * attendee1 by processing a datastore update signal.
			 */
			beforeEach(() => {
				// Setup workspace initialization signal
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now,
							avgLatency: 10,
							data: {
								"system:presence": {
									"clientToSessionId": {
										[connectionId2]: {
											"rev": 0,
											"timestamp": initialTime,
											"value": attendeeId2,
										},
									},
								},
								"s:name:testWorkspace": {
									"latest": {
										[attendeeId2]: {
											"rev": 0,
											"timestamp": clock.now,
											"value": toOpaqueJson({ x: 0, y: 0, z: 0 }),
										},
									},
								},
							},
						},
					},
				]);

				const stateWorkspace = presence.states.getWorkspace("name:testWorkspace", {
					latest: StateFactory.latest({
						local: { x: 0, y: 0, z: 0 } satisfies Point3D,
						validator: point3DValidatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});
				latest = stateWorkspace.states.latest;

				// Process a valid update signal with Point3D data
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": attendeeUpdate,
								"s:name:testWorkspace": {
									"latest": {
										[attendeeId1]: {
											"rev": 2,
											"timestamp": clock.now - 10,
											"value": toOpaqueJson({ x: 10, y: 20, z: 30 }),
										},
									},
								},
							},
						},
						clientId: "client1",
					},
					false,
				);
			});

			describe("is not called", () => {
				it("by .getRemote()", () => {
					// Calling getRemote should not invoke the validator (only a value read will).
					latest.getRemote(remoteAttendee);
					assert.equal(point3DValidatorFunction.callCount, 0);
				});

				it("by .getRemotes()", () => {
					for(const _ of latest.getRemotes()){
						assert.equal(point3DValidatorFunction.callCount, 0);
					}
				});

				it("when accessing .local", () => {
					assert.equal(point3DValidatorFunction.callCount, 0, "initial call count is wrong");
					assert.deepEqual(latest.local, { x: 0, y: 0, z: 0 });
					assert.equal(
						point3DValidatorFunction.callCount,
						0,
						"validator was called on local data",
					);
				});

				it("when remote data is updated", () => {
					const remoteData = latest.getRemote(remoteAttendee);

					// Should call validator
					runValidatorTest({
						getRemoteValue: () => remoteData.value(),
						expectedCallCount: 1,
						expectedValue: { x: 10, y: 20, z: 30 },
						validatorFunction: point3DValidatorFunction,
					});

					// Send updated data from remote client
					presence.processSignal(
						[],
						datastoreUpdateSignal(clock, {
							"rev": 3,
							"timestamp": clock.now - 10,
							"value": toOpaqueJson({ x: 50, y: 60, z: 70 }),
						}),
						false,
					);

					// Value is not updated; validator is not called
					assert.equal(point3DValidatorFunction.callCount, 1);
					assert.deepEqual(remoteData.value(), { x: 10, y: 20, z: 30 });
				});
			});

			describe("is called", () => {
				it("on first value() call", () => {
					const remoteData = latest.getRemote(remoteAttendee);
					runValidatorTest({
						getRemoteValue: () => remoteData.value(),
						expectedCallCount: 1,
						expectedValue: { x: 10, y: 20, z: 30 },
						validatorFunction: point3DValidatorFunction,
					});
				});

				it("only once for multiple value() calls on unchanged data", () => {
					const remoteData = latest.getRemote(remoteAttendee);
					runMultipleCallsTest({
						getRemoteValue: () => remoteData.value(),
						expectedValue: { x: 10, y: 20, z: 30 },
						validatorFunction: point3DValidatorFunction,
					});
				});

				it("on value() call after remote data has changed", () => {
					// Get the remote data and read it, verify that the validator is called once.
					const remoteData = latest.getRemote(remoteAttendee);
					assert.deepEqual(remoteData.value(), { x: 10, y: 20, z: 30 });
					assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");

					// Send updated data from remote client
					presence.processSignal(
						[],
						datastoreUpdateSignal(clock, {
							"rev": 3,
							"timestamp": clock.now - 10,
							"value": toOpaqueJson({ x: 50, y: 60, z: 70 }),
						}),
						false,
					);

					// Reading the remote value should cause the validator to be called a second time since the data has been changed.
					const data2 = latest.getRemote(remoteAttendee);
					assert.deepEqual(
						data2.value(),
						{ x: 50, y: 60, z: 70 },
						"updated remote value is wrong",
					);
					assert.equal(
						point3DValidatorFunction.callCount,
						2,
						"validator should be called twice",
					);
				});

				it("when remote data changes from valid to invalid", () => {
					// Get the remote data and read it, verify that the validator is called once.
					const remoteData = latest.getRemote(remoteAttendee);
					assert.deepEqual(remoteData.value(), { x: 10, y: 20, z: 30 });
					assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");

					// Send invalid data from remote client
					presence.processSignal(
						[],
						datastoreUpdateSignal(clock, {
							"rev": 3,
							"timestamp": clock.now - 10,
							"value": toOpaqueJson("invalid"),
						}),
						false,
					);

					// Reading the remote value should cause the validator to be called a second time and return undefined
					const data2 = latest.getRemote(remoteAttendee);
					assert.equal(data2.value(), undefined, "invalid data should return undefined");
					assert.equal(
						point3DValidatorFunction.callCount,
						2,
						"validator should be called twice",
					);
				});

				it("when remote data changes from invalid to valid", () => {
					// First send invalid data
					presence.processSignal(
						[],
						datastoreUpdateSignal(clock, {
							"rev": 3,
							"timestamp": clock.now - 10,
							"value": toOpaqueJson("invalid"),
						}),
						false,
					);

					// Get the remote data and read it, verify that the validator is called once and returns undefined
					const remoteData = latest.getRemote(remoteAttendee);
					assert.equal(remoteData.value(), undefined);
					assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");

					// Send valid data from remote client
					presence.processSignal(
						[],
						datastoreUpdateSignal(clock, {
							"rev": 4,
							"timestamp": clock.now - 10,
							"value": toOpaqueJson({ x: 100, y: 200, z: 300 }),
						}),
						false,
					);

					// Reading the remote value should cause the validator to be called a second time and return valid data
					const data2 = latest.getRemote(remoteAttendee);
					assert.deepEqual(
						data2.value(),
						{ x: 100, y: 200, z: 300 },
						"valid data should be returned",
					);
					assert.equal(
						point3DValidatorFunction.callCount,
						2,
						"validator should be called twice",
					);
				});

				it("when remote data changes from invalid to invalid", () => {
					// First send invalid data
					presence.processSignal(
						[],
						datastoreUpdateSignal(clock, {
							"rev": 3,
							"timestamp": clock.now - 10,
							"value": toOpaqueJson("invalid"),
						}),
						false,
					);

					// Get the remote data and read it, verify that the validator is called once and returns undefined
					const remoteData = latest.getRemote(remoteAttendee);
					assert.equal(remoteData.value(), undefined);
					assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");

					// Send different invalid data from remote client
					presence.processSignal(
						[],
						datastoreUpdateSignal(clock, {
							"rev": 4,
							"timestamp": clock.now,
							"value": toOpaqueJson("also-invalid"),
						}),
						false,
					);

					// Reading the remote value should cause the validator to be called a second time and still return undefined
					const data2 = latest.getRemote(remoteAttendee);
					assert.equal(data2.value(), undefined, "invalid data should return undefined");
					assert.equal(
						point3DValidatorFunction.callCount,
						2,
						"validator should be called twice",
					);
				});
			});
		});
	});
});
