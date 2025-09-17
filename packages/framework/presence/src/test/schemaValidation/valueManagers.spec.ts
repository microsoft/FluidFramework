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
import type { Presence } from "../../presence.js";
import type { SignalMessages } from "../../protocol.js";
import { MockEphemeralRuntime } from "../mockEphemeralRuntime.js";
import type { ProcessSignalFunction } from "../testUtils.js";
import {
	assertFinalExpectations,
	attendeeId1,
	attendeeId2,
	connectionId1,
	connectionId2,
	createSpiedValidator,
	prepareConnectedPresence,
} from "../testUtils.js";

import type { Attendee, Latest, LatestMap } from "@fluidframework/presence/beta";
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
					"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
				},
				"key2": {
					"rev": 1,
					"timestamp": 0,
					"value": toOpaqueJson({ x: 2, y: 2, z: 2 }),
				},
			},
		},
	},
} as const;

function datastoreUpdateSignal(
	sendTimestamp: number,
	valueObjectName: string,
	metadata:
		| {
				"rev": number;
				"timestamp": number;
				"value": OpaqueJsonDeserialized<unknown>;
		  }
		| {
				"rev": number;
				"items": Record<
					string,
					{
						"rev": number;
						"timestamp": number;
						"value": OpaqueJsonDeserialized<unknown>;
					}
				>;
		  },
): InboundExtensionMessage<SignalMessages> {
	return {
		type: "Pres:DatastoreUpdate",
		content: {
			sendTimestamp,
			avgLatency: 20,
			data: {
				"system:presence": attendeeUpdate,
				"s:name:testWorkspace": {
					[valueObjectName]: {
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
	assert.equal(params.validatorFunction.callCount, params.expectedCallCount);
	assert.deepEqual(initialValue, params.expectedValue);
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
	assert.equal(params.validatorFunction.callCount, 1);
	assert.deepEqual(firstValue, params.expectedValue);

	// Subsequent calls should not invoke validator when data is unchanged
	const secondValue = params.getRemoteValue();
	assert.equal(params.validatorFunction.callCount, 1);
	const thirdValue = params.getRemoteValue();
	assert.equal(params.validatorFunction.callCount, 1);
	assert.deepEqual(secondValue, params.expectedValue);
	assert.deepEqual(thirdValue, params.expectedValue);
}

describe("Presence", () => {
	describe("Runtime schema validation", () => {
		const afterCleanUp: (() => void)[] = [];
		const initialTime = 1000;

		type UpdateContent = typeof latestUpdate & typeof latestMapUpdate;

		function processUpdates(valueManagerUpdates: Record<string, UpdateContent>): void {
			const updates = { "system:presence": attendeeUpdate, ...valueManagerUpdates };

			processSignal(
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
		let presence: Presence;
		let processSignal: ProcessSignalFunction;
		let runtime: MockEphemeralRuntime;
		let remoteAttendee: Attendee;
		let validatorCallExpected: boolean | "once";
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
			validatorCallExpected = true;
			point3DValidatorFunction = createSpiedValidator<Point3D>((d: unknown) => {
				if (validatorCallExpected === "once") {
					validatorCallExpected = false;
				} else {
					assert(
						validatorCallExpected,
						"point3DValidatorFunction should not be called at this time",
					);
				}
				return typeof d === "object" ? (d as Point3D) : undefined;
			});

			// Create Presence joining session as attendeeId-2. Tests will act as attendee2
			({ presence, processSignal } = prepareConnectedPresence(
				runtime,
				attendeeId2,
				connectionId2,
				clock,
				logger,
			));

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

		describe("Latest validator", () => {
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
				processSignal(
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
					for (const _ of latest.getRemotes()) {
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
					const timestamp = clock.now - 15;
					processSignal(
						[],
						datastoreUpdateSignal(timestamp, "latest", {
							"rev": 3,
							timestamp,
							"value": toOpaqueJson({ x: 50, y: 60, z: 70 }),
						}),
						false,
					);

					// Validator is not called by remote update
					assert.equal(point3DValidatorFunction.callCount, 1);
				});
			});

			describe("is called", () => {
				it("on first .value() call", () => {
					const remoteData = latest.getRemote(remoteAttendee);
					runValidatorTest({
						getRemoteValue: () => remoteData.value(),
						expectedCallCount: 1,
						expectedValue: { x: 10, y: 20, z: 30 },
						validatorFunction: point3DValidatorFunction,
					});
				});

				it("only once for multiple .value() calls in series and .value() always returns same value", () => {
					const remoteData = latest.getRemote(remoteAttendee);
					runMultipleCallsTest({
						getRemoteValue: () => remoteData.value(),
						expectedValue: { x: 10, y: 20, z: 30 },
						validatorFunction: point3DValidatorFunction,
					});
				});

				it("on .value() call after remote data has changed", () => {
					// Get the remote data and read it, verify that the validator is called once.
					const remoteData = latest.getRemote(remoteAttendee);
					assert.deepEqual(remoteData.value(), { x: 10, y: 20, z: 30 });
					assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");

					// Send updated data from remote client
					const timestamp = clock.now - 15;
					processSignal(
						[],
						datastoreUpdateSignal(timestamp, "latest", {
							"rev": 3,
							timestamp,
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

				it("on .value() call when remote data changes from valid to invalid", () => {
					// Get the remote data and read it, verify that the validator is called once.
					const remoteData = latest.getRemote(remoteAttendee);
					assert.deepEqual(remoteData.value(), { x: 10, y: 20, z: 30 });
					assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");

					// Send invalid data from remote client
					const timestamp = clock.now - 15;
					processSignal(
						[],
						datastoreUpdateSignal(timestamp, "latest", {
							"rev": 3,
							timestamp,
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

				it("on .value() call when remote data changes from invalid to valid", () => {
					// First send invalid data
					let timestamp = clock.now - 15;
					processSignal(
						[],
						datastoreUpdateSignal(timestamp, "latest", {
							"rev": 3,
							timestamp,
							"value": toOpaqueJson("invalid"),
						}),
						false,
					);

					// Get the remote data and read it, verify that the validator is called once and returns undefined
					const remoteData = latest.getRemote(remoteAttendee);
					assert.equal(remoteData.value(), undefined);
					assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");

					// Send valid data from remote client
					timestamp += 10;
					processSignal(
						[],
						datastoreUpdateSignal(timestamp, "latest", {
							"rev": 4,
							timestamp,
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

				it("on .value() call when remote data changes from invalid to invalid", () => {
					// First send invalid data
					let timestamp = clock.now - 15;
					processSignal(
						[],
						datastoreUpdateSignal(timestamp, "latest", {
							"rev": 3,
							timestamp,
							"value": toOpaqueJson("invalid"),
						}),
						false,
					);

					// Get the remote data and read it, verify that the validator is called once and returns undefined
					const remoteData = latest.getRemote(remoteAttendee);
					assert.equal(remoteData.value(), undefined);
					assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");

					// Send different invalid data from remote client
					timestamp += 10;
					processSignal(
						[],
						datastoreUpdateSignal(timestamp, "latest", {
							"rev": 4,
							timestamp,
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

		describe("LatestMap with validation", () => {
			let latestMap: LatestMap<Point3D, string>;

			/**
			 * This beforeEach sets up the presence workspace itself and gets a
			 * reference to it.
			 */
			beforeEach(() => {
				// workspace setup's initialization signal
				runtime.signalsExpected.push([
					{
						"type": "Pres:DatastoreUpdate",
						"content": {
							"sendTimestamp": 1030,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId2]: {
											"rev": 0,
											"timestamp": 1000,
											"value": attendeeId2,
										},
									},
								},
								"s:name:testWorkspace": {
									"latestMap": {
										[attendeeId2]: {
											"rev": 0,
											"items": {
												"key1": {
													"rev": 0,
													"timestamp": 1030,
													"value": toOpaqueJson({ "x": 0, "y": 0, "z": 0 }),
												},
												"key2": {
													"rev": 0,
													"timestamp": 1030,
													"value": toOpaqueJson({ "x": 0, "y": 0, "z": 0 }),
												},
											},
										},
									},
								},
							},
						},
					},
				]);

				const stateWorkspace = presence.states.getWorkspace("name:testWorkspace", {
					latestMap: StateFactory.latestMap({
						local: { "key1": { x: 0, y: 0, z: 0 }, "key2": { x: 0, y: 0, z: 0 } },
						validator: point3DValidatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				latestMap = stateWorkspace.states.latestMap;
			});

			function sendInvalidData(key: string = "key1"): void {
				const timestamp = clock.now - 15;
				processSignal(
					[],
					datastoreUpdateSignal(timestamp, "latestMap", {
						"rev": 2,
						"items": {
							[key]: {
								"rev": 2,
								timestamp,
								"value": toOpaqueJson("invalid"),
							},
						},
					}),
					false,
				);
			}

			describe("validator is not called", () => {
				beforeEach(() => {
					validatorCallExpected = false;
				});

				it("when reading local key value", () => {
					// Act
					const localData = latestMap.local.get("key1");
					// Verify
					assert.equal(point3DValidatorFunction.callCount, 0);
					// double check local data
					assert.deepEqual(localData, { x: 0, y: 0, z: 0 });
				});

				it("when writing local key value", () => {
					// Setup
					runtime.signalsExpected.push([
						{
							"type": "Pres:DatastoreUpdate",
							"content": {
								"sendTimestamp": 1030,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": attendeeId2,
											},
										},
									},
									"s:name:testWorkspace": {
										"latestMap": {
											[attendeeId2]: {
												"rev": 1,
												"items": {
													"key1": {
														"rev": 1,
														"timestamp": 1030,
														"value": toOpaqueJson({ "x": 0, "y": 1, "z": 2 }),
													},
												},
											},
										},
									},
								},
							},
						},
					]);

					// Act
					latestMap.local.set("key1", { x: 0, y: 1, z: 2 });
					// Verify
					assert.equal(point3DValidatorFunction.callCount, 0);
				});

				it("when calling .get() on remote map", () => {
					const remoteData = latestMap.getRemote(remoteAttendee);
					// Act
					remoteData.get("key1");
					// Verify
					assert.equal(point3DValidatorFunction.callCount, 0);
				});

				it("when accessing keys only in .forEach()", () => {
					// Setup
					const remoteData = latestMap.getRemote(remoteAttendee);
					let counter = 0;
					const expectedValues = [
						["key1", { x: 1, y: 1, z: 1 }],
						["key2", { x: 2, y: 2, z: 2 }],
					];
					// Act
					// eslint-disable-next-line unicorn/no-array-for-each -- forEach is being tested here
					remoteData.forEach((_value, key) => {
						// Verify
						assert.equal(point3DValidatorFunction.callCount, 0, "call count is wrong");
						assert.equal(key, expectedValues[counter][0]);
						counter++;
					});
					// Make sure forEach iterated through all keys
					assert.equal(
						counter,
						expectedValues.length,
						"counter should match expected values length",
					);
				});
			});

			describe("validator is called", () => {
				beforeEach(() => {
					validatorCallExpected = "once";
				});

				for (const { desc, setup, expectedValue } of [
					{
						desc: "for valid value",
						setup: () => {},
						expectedValue: { x: 1, y: 1, z: 1 },
					},
					{
						desc: "for invalid value",
						setup: sendInvalidData,
						expectedValue: undefined,
					},
				] as const) {
					it(`once when key.value() is called ${desc}`, () => {
						setup();
						const remoteData = latestMap.getRemote(remoteAttendee);
						runValidatorTest({
							getRemoteValue: () => remoteData.get("key1")?.value(),
							expectedCallCount: 1,
							expectedValue,
							validatorFunction: point3DValidatorFunction,
						});
					});

					it(`only once for multiple key.value() calls in series and .value() always returned same result ${desc}`, () => {
						setup();
						const remoteData = latestMap.getRemote(remoteAttendee);
						runMultipleCallsTest({
							getRemoteValue: () => remoteData.get("key1")?.value(),
							expectedValue,
							validatorFunction: point3DValidatorFunction,
						});
					});

					it(`exactly once for each value's .value() calls in .forEach() and .value() always returns same result ${desc}`, () => {
						setup();
						const remoteData = latestMap.getRemote(remoteAttendee);
						let counter = 0;
						const expectedValues = [
							// only key1 value might be altered by the setup function
							["key1", expectedValue],
							// key2 value will always be the valid
							["key2", { x: 2, y: 2, z: 2 }],
						];
						// eslint-disable-next-line unicorn/no-array-for-each -- forEach is being tested here
						remoteData.forEach((value, key) => {
							assert.equal(key, expectedValues[counter][0]);
							// reset call expectations/count for each iteration
							validatorCallExpected = "once";
							point3DValidatorFunction.callCount = 0;

							// Act - first call
							const valueData = value?.value();
							// Verify
							assert.equal(point3DValidatorFunction.callCount, 1, "validator was not called");
							// double check value
							assert.deepEqual(
								valueData,
								expectedValues[counter][1],
								`value at key "${key}" is wrong`,
							);

							// Act - second call
							// Access value a second time; should not affect validator call count
							const valueDataRedux = value?.value();
							// Verify
							assert.equal(
								point3DValidatorFunction.callCount,
								1,
								"validator was called a second time",
							);
							assert.strictEqual(valueDataRedux, valueData, `value at key "${key}" is wrong`);

							counter++;
						});
						// Make sure forEach iterated through all keys
						assert.equal(
							counter,
							expectedValues.length,
							"counter should match expected values length",
						);
					});
				}

				for (const { desc, setup, expectedInitialValue, newData, expectedValue } of [
					{
						desc: "from valid to different valid value",
						setup: () => {},
						expectedInitialValue: { x: 1, y: 1, z: 1 },
						newData: { x: 4, y: 4, z: 4 },
						expectedValue: { x: 4, y: 4, z: 4 },
					},
					{
						desc: "from valid to same valid value",
						setup: () => {},
						expectedInitialValue: { x: 1, y: 1, z: 1 },
						newData: { x: 1, y: 1, z: 1 },
						expectedValue: { x: 1, y: 1, z: 1 },
					},
					{
						desc: "from valid to invalid value",
						setup: () => {},
						expectedInitialValue: { x: 1, y: 1, z: 1 },
						newData: "invalid",
						expectedValue: undefined,
					},
					{
						desc: "from invalid to valid value",
						setup: sendInvalidData,
						expectedInitialValue: undefined,
						newData: { x: 4, y: 4, z: 4 },
						expectedValue: { x: 4, y: 4, z: 4 },
					},
					{
						desc: "from invalid to invalid value",
						setup: sendInvalidData,
						expectedInitialValue: undefined,
						newData: "invalid",
						expectedValue: undefined,
					},
				] as const) {
					it(`during .value() call after remote key data has changed ${desc}`, () => {
						// Setup
						setup();

						const originalMap = latestMap.getRemote(remoteAttendee);
						// Get the remote data and read it, expect that the validator is called once.
						const key1Value = originalMap.get("key1")?.value();
						assert.equal(point3DValidatorFunction.callCount, 1, "first call count is wrong");
						assert.deepEqual(key1Value, expectedInitialValue);
						// Reset call count for next verification
						point3DValidatorFunction.callCount = 0;

						// Process updated key data from remote client
						const timestamp = clock.now - 15;
						processSignal(
							[],
							datastoreUpdateSignal(timestamp, "latestMap", {
								"rev": 3,
								"items": {
									"key1": {
										"rev": 3,
										timestamp,
										"value": toOpaqueJson(newData),
									},
								},
							}),
							false,
						);

						// Verify no call yet
						assert.equal(
							point3DValidatorFunction.callCount,
							0,
							"call count after update is wrong",
						);

						// Reading the remote value should cause the validator to be
						// called since the data has been changed.
						const updatedMap = latestMap.getRemote(remoteAttendee);

						validatorCallExpected = "once";

						// Act - read updated key value
						const updatedKey1Value = updatedMap.get("key1")?.value();

						// Verify
						assert.equal(
							point3DValidatorFunction.callCount,
							1,
							"validator should be called twice",
						);
						assert.deepEqual(
							updatedKey1Value,
							expectedValue,
							"updated remote key value is wrong",
						);
					});
				}
			});

			// Not this block is after "is called" as it is only valid when those tests are passing.
			describe("validator is not called", () => {
				it("during .value() call for unchanged keys", () => {
					// Setup
					const originalMap = latestMap.getRemote(remoteAttendee);
					validatorCallExpected = "once";
					// Read key1 value - should call validator once
					const key1Value = originalMap.get("key1")?.value();
					assert.equal(
						point3DValidatorFunction.callCount,
						1,
						"validator should be called once for key1",
					);
					assert.deepEqual(key1Value, { x: 1, y: 1, z: 1 });

					// Update key2 (different key) with new data, keeping key1 unchanged
					const timestamp = clock.now - 15;
					processSignal(
						[],
						datastoreUpdateSignal(timestamp, "latestMap", {
							"rev": 2,
							"items": {
								"key2": {
									"rev": 2,
									timestamp,
									"value": toOpaqueJson({ "x": 4, "y": 4, "z": 4 }),
								},
							},
						}),
						false,
					);

					const updatedMap = latestMap.getRemote(remoteAttendee);
					const key1Redux = updatedMap.get("key1");
					assert.ok(key1Redux);

					// Verify
					// Read key1 value (again) but from updated map - should NOT call validator again since key1 data hasn't changed
					const key1ValueRedux = key1Redux.value();
					assert.equal(
						point3DValidatorFunction.callCount,
						1,
						"validator should still be called only once for key1",
					);
					assert.strictEqual(key1ValueRedux, key1Value, "key1 value should remain unchanged");

					// Test verification
					validatorCallExpected = true;
					point3DValidatorFunction.callCount = 0;
					// key2 should have been updated; so, reading key2 value from
					// original map and updated map should both result in call
					// count increases. Also check for updated value.
					let key2Value = originalMap.get("key2")?.value();
					assert.equal(
						point3DValidatorFunction.callCount,
						1,
						"validator should be called once for original key2 value read",
					);
					assert.deepEqual(
						key2Value,
						{ "x": 2, "y": 2, "z": 2 },
						"key2 value from original map should be unchanged",
					);
					key2Value = updatedMap.get("key2")?.value();
					assert.equal(
						point3DValidatorFunction.callCount,
						2,
						"validator should be called second time for updated key2 value read",
					);
					assert.deepEqual(
						key2Value,
						{ "x": 4, "y": 4, "z": 4 },
						"key2 should have updated value",
					);
				});
			});
		});
	});
});
