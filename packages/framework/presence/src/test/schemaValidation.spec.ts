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
import { StateFactoryInternal } from "../stateFactory.js";

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
	InternalTypes,
	Latest,
	LatestMap,
	ProxiedValueAccessor,
	StatesWorkspace,
} from "@fluidframework/presence/beta";

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

describe("Presence", () => {
	describe("Runtime schema validation", () => {
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

			presence.processSignal(
				[],
				{
					type: "Pres:ClientJoin",
					content: {
						sendTimestamp: clock.now - 50,
						avgLatency: 50,
						data: {
							...systemWorkspace,
						},
						updateProviders: [connectionId2],
					},
					clientId: connectionId2,
				},
				false,
			);

			// Join attendee2 to the session; tests will act as attendee2
			presence = prepareConnectedPresence(runtime, attendeeId2, connectionId2, clock, logger);

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

		describe.skip("LatestValueManager", () => {
			let count: Latest<TestData, ProxiedValueAccessor<TestData>>;
			let stateWorkspace: StatesWorkspace<{
				count: InternalTypes.ManagerFactory<
					string,
					InternalTypes.ValueRequiredState<{
						num: number;
					}>,
					typeof count
				>;
			}>;

			beforeEach(() => {
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: 1030,
							avgLatency: 10,
							data: {
								...systemWorkspace,
								"s:name:testStateWorkspace": {
									"count": {
										[attendeeId2]: {
											"rev": 0,
											"timestamp": 1030,
											"value": toOpaqueJson({ "num": 0 }),
										},
									},
								},
							},
						},
					},
				]);

				// validatorFunction = createSpiedValidator<TestData>();

				assert.equal(validatorFunction.callCount, 0);
			});

			describe("validator", () => {
				beforeEach(() => {
					runtime.signalsExpected.push([
						{
							"type": "Pres:DatastoreUpdate",
							"content": {
								"sendTimestamp": 1030,
								"avgLatency": 10,
								"data": {
									...systemWorkspace,
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 1,
												"timestamp": 1030,
												"value": toOpaqueJson({ "num": 11 }),
											},
										},
									},
								},
							},
						},
					]);

					stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
						count: StateFactoryInternal.latest({
							local: { num: 0 } satisfies TestData,
							validator: validatorFunction,
							settings: { allowableUpdateLatencyMs: 0 },
						}),
					});
					count = stateWorkspace.states.count;
					count.local = { num: 11 };
				});

				it("is not called by getRemote", () => {
					// Setup
					const attendee2 = presence.attendees.getAttendee(attendeeId2);

					// Act - Calling getRemote should not invoke the validator (only a value read will).
					count.getRemote(attendee2);

					// Verify
					assert.equal(validatorFunction.callCount, 0);
				});

				it("is called on first .value() call", () => {
					// Setup
					const attendee2 = presence.attendees.getAttendee(attendeeId2);
					const remoteData = count.getRemote(attendee2);

					// Act - Reading the data should cause the validator to get called once.
					const value = remoteData.value();

					// Verify
					assert.equal(value?.num, 11);
					assert.equal(validatorFunction.callCount, 1);
				});

				it("is called only once for multiple .value() calls on unchanged data", () => {
					// Setup
					const attendee2 = presence.attendees.getAttendee(attendeeId2);
					const remoteData = count.getRemote(attendee2);

					// Reading the data should cause the validator to get called once.
					assert.equal(remoteData.value()?.num, 11);
					assert.equal(validatorFunction.callCount, 1);

					// Subsequent reads should not call the validator when there is no new data.
					assert.equal(remoteData.value()?.num, 11);
					assert.equal(validatorFunction.callCount, 1);
				});

				it("returns undefined through proxied value accessor when remote data is invalid", () => {
					// Setup
					runtime.signalsExpected.push([
						{
							"type": "Pres:DatastoreUpdate",
							"content": {
								"sendTimestamp": 1030,
								"avgLatency": 10,
								"data": {
									...systemWorkspace,
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 2,
												"timestamp": 1030,
												"value": toOpaqueJson("string"),
											},
										},
									},
								},
							},
						},
					]);

					count = stateWorkspace.states.count;
					count.local = "string" as unknown as TestData;
					const attendee2 = presence.attendees.getAttendee(attendeeId2);
					const remote = count.getRemote(attendee2);

					// Act & Verify
					assert.equal(validatorFunction.callCount, 0, "call count should be 0");
					let remoteData = remote.value();
					assert.equal(remoteData, undefined);
					assert.equal(validatorFunction.callCount, 1, "call count should be 1");

					// Subsequent calls do not invoke validator
					remoteData = remote.value();
					assert.equal(validatorFunction.callCount, 1, "call count should still be 1");
				});
			});
		});

		describe.skip("LatestMapValueManager", () => {
			let count: LatestMap<
				{
					num: number;
				},
				"key1",
				ProxiedValueAccessor<{
					num: number;
				}>
			>;
			let stateWorkspace: StatesWorkspace<{
				count: InternalTypes.ManagerFactory<
					string,
					InternalTypes.MapValueState<TestData, "key1">,
					typeof count
				>;
			}>;

			beforeEach(() => {
				runtime.signalsExpected.push(
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1030,
								"avgLatency": 10,
								"data": {
									...systemWorkspace,
									"s:name:testStateWorkspace": {
										count: {
											[attendeeId2]: {
												rev: 0,
												items: {
													key1: {
														rev: 0,
														timestamp: 1030,
														value: toOpaqueJson({ "num": 0 }),
													},
												},
											},
										},
									},
								},
							},
						},
					],
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1030,
								"avgLatency": 10,
								"data": {
									...systemWorkspace,
									"s:name:testStateWorkspace": {
										count: {
											[attendeeId2]: {
												rev: 1,
												items: {
													key1: {
														rev: 1,
														timestamp: 1030,
														value: toOpaqueJson({ "num": 84 }),
													},
												},
											},
										},
									},
								},
							},
						},
					],
				);

				assert.equal(validatorFunction.callCount, 0);

				stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactoryInternal.latestMap({
						local: { "key1": { num: 0 } },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				count = stateWorkspace.states.count;
			});

			describe("validator", () => {
				it("is not called when referencing a map key", () => {
					// Act & Verify
					count.local.set("key1", { num: 84 });
					const attendee2 = presence.attendees.getAttendee(attendeeId2);

					// Getting just the map or its key should not cause the validator to run
					const mapData = count.getRemote(attendee2);
					assert.equal(validatorFunction.callCount, 0);

					mapData.get("key1");
					assert.equal(validatorFunction.callCount, 0);
				});

				it("is called once when key.value() is called", () => {
					// Act & Verify
					count.local.set("key1", { num: 84 });

					const attendee2 = presence.attendees.getAttendee(attendeeId2);
					const mapData = count.getRemote(attendee2);

					// Reading an individual map item's value should cause the validator to get called once.
					assert.equal(mapData.get("key1")?.value()?.num, 84);
					assert.equal(validatorFunction.callCount, 1);
				});

				it("is only called once for multiple key.value() calls on unchanged data", () => {
					// Act & Verify
					count.local.set("key1", { num: 84 });
					const attendee2 = presence.attendees.getAttendee(attendeeId2);

					// Reading the data should cause the validator to get called once. Since this is a map, we need to read a key
					// value to call the validator.
					const remoteData = count.getRemote(attendee2);

					let keyData = remoteData.get("key1")?.value();

					// Subsequent reads should not call the validator when there is no new data.
					keyData = remoteData.get("key1")?.value();
					keyData = remoteData.get("key1")?.value();
					assert.equal(validatorFunction.callCount, 1);
					assert.equal(keyData?.num, 84);
				});
			});
		});

		describe("LatestMapValueManager", () => {
			let stateWorkspace: StatesWorkspace<{
				count: InternalTypes.ManagerFactory<
					string,
					InternalTypes.MapValueState<TestData, "key1" | "key2">,
					LatestMap<TestData, "key1" | "key2", ProxiedValueAccessor<TestData>>
				>;
			}>;

			beforeEach(() => {
				// Add expected workspace initialization signal
				runtime.signalsExpected.push([
					createExpectedMapUpdateSignal(connectionId2, "count", attendeeId2, {
						"key1": { num: 0 },
						"key2": { num: 0 },
					}),
				]);

				// initialize the state workspace, which will process the signal above.
				stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { "key1": { num: 0 }, "key2": { num: 0 } },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				// Process signal with new value
				presence.processSignal(
					[],
					createMapKeyUpdateSignal(
						connectionId2,
						"count",
						attendeeId2,
						"key1",
						{ num: 84 },
						1,
					),
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

					it("when accessing keys only in a forEach", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						let counter = 0;
						const expectedValues = [
							["key1", 84],
							["key2", 0],
						];
						// eslint-disable-next-line unicorn/no-array-for-each -- forEach is being tested here
						remoteData.forEach(
							(value: LatestData<TestData, ProxiedValueAccessor<TestData>>, key: string) => {
								assert.equal(key, expectedValues[counter][0]);
								counter++;
								assert.equal(validatorFunction.callCount, 0, "call count is wrong");
							},
						);
					});

					it("more than once when accessing values in a forEach", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						let counter = 0;
						const expectedValues = [
							["key1", 84],
							["key2", 0],
						];
						// eslint-disable-next-line unicorn/no-array-for-each -- forEach is being tested here
						remoteData.forEach(
							(value: LatestData<TestData, ProxiedValueAccessor<TestData>>, key: string) => {
								assert.equal(key, expectedValues[counter][0]);
								assert.equal(
									value?.value()?.num,
									expectedValues[counter][1],
									`value at key "${key}" is wrong`,
								);
								// Access value twice; should not affect validator call count
								assert.equal(
									value?.value()?.num,
									expectedValues[counter][1],
									`value at key "${key}" is wrong`,
								);
								counter++;
								assert.equal(validatorFunction.callCount, counter, "call count is wrong");
							},
						);
					});

					// FIXME: Tests should pass
					describe.skip("for unchanged keys", () => {
						beforeEach(() => {
							// Set up both keys with some initial data
							presence.processSignal(
								[],
								createMapUpdateSignal(
									connectionId2,
									"count",
									attendeeId2,
									{ "key1": { num: 84 }, "key2": { num: 42 } },
									1,
								),
								false,
							);
						});

						it("with ref to LatestMap state manager", () => {
							const mgr = stateWorkspace.states.count;

							// Read key1 value - should call validator once
							assert.equal(mgr.getRemote(attendee2).get("key1")?.value()?.num, 84);
							assert.equal(
								validatorFunction.callCount,
								1,
								"validator should be called once for key1",
							);

							// Update key2 (different key) with new data, keeping key1 unchanged
							presence.processSignal(
								[],
								createMapUpdateSignal(
									connectionId2,
									"count",
									attendeeId2,
									{
										"key1": { num: 84 },
										"key2": { num: 99 },
									},
									2,
									1040,
								),
								false,
							);

							// Read key1 value again - should NOT call validator again since key1 data hasn't changed
							assert.equal(
								mgr.getRemote(attendee2).get("key1")?.value()?.num,
								84,
								"key1 value should remain unchanged",
							);

							// FIXME: This assert fails.
							assert.equal(
								validatorFunction.callCount,
								1,
								"validator should still be called only once for key1",
							);

							// Read key2 value - should call validator for the second time (first time for key2)
							assert.equal(
								mgr.getRemote(attendee2).get("key2")?.value()?.num,
								99,
								"key2 should have updated value",
							);

							// FIXME: This assert fails.
							assert.equal(
								validatorFunction.callCount,
								2,
								"validator should be called twice total (once for each key)",
							);
						});

						it("with ref to getRemote(attendee2)", () => {
							const remoteData = stateWorkspace.states.count.getRemote(attendee2);

							// Read key1 value - should call validator once
							assert.equal(remoteData.get("key1")?.value()?.num, 84);
							assert.equal(
								validatorFunction.callCount,
								1,
								"validator should be called once for key1",
							);

							// Update key2 (different key) with new data, keeping key1 unchanged
							presence.processSignal(
								[],
								createMapUpdateSignal(
									connectionId2,
									"count",
									attendeeId2,
									{
										"key1": { num: 84 },
										"key2": { num: 99 },
									},
									2,
									1040,
								),
								false,
							);

							// Read key1 value again - should NOT call validator again since key1 data hasn't changed
							// FIXME: This assert fails.
							assert.equal(
								remoteData.get("key1")?.value()?.num,
								84,
								"key1 value should remain unchanged",
							);
							assert.equal(
								validatorFunction.callCount,
								1,
								"validator should still be called only once for key1",
							);

							// Read key2 value - should call validator for the second time (first time for key2)
							// FIXME: This assert fails.
							assert.equal(
								remoteData.get("key2")?.value()?.num,
								99,
								"key2 should have updated value",
							);
							assert.equal(
								validatorFunction.callCount,
								2,
								"validator should be called twice total (once for each key)",
							);
						});
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

					it("when accessing values in a forEach", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						let counter = 0;
						const expectedValues = [
							["key1", 84],
							["key2", 0],
						];
						// eslint-disable-next-line unicorn/no-array-for-each -- forEach is being tested here
						remoteData.forEach(
							(value: LatestData<TestData, ProxiedValueAccessor<TestData>>, key: string) => {
								assert.equal(key, expectedValues[counter][0]);
								assert.equal(
									value?.value()?.num,
									expectedValues[counter][1],
									`value at key "${key}" is wrong`,
								);
								counter++;
								assert.equal(validatorFunction.callCount, counter, "call count is wrong");
							},
						);
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
							createMapKeyUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"key1",
								{ num: 22 },
								2,
								1040,
							),
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
							createMapKeyUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"key1",
								"invalid" as unknown as TestData,
								2,
								1040,
							),
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
							createMapKeyUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"key1",
								"invalid" as unknown as TestData,
								2,
							),
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
							createMapKeyUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"key1",
								{ num: 55 },
								3,
								1040,
							),
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
							createMapKeyUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"key1",
								"invalid1" as unknown as TestData,
								2,
							),
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
							createMapKeyUpdateSignal(
								connectionId2,
								"count",
								attendeeId2,
								"key1",
								"invalid2" as unknown as TestData,
								3,
								1040,
							),
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
