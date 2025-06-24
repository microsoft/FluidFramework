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

		describe("LatestValueManager", () => {
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

				// FIXME this passes but is it testing the right thing?
				it("returns undefined through proxied value accessor when remote data is invalid", () => {
					// Setup
					// Add expected signal with invalid data
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

					// Set some invalid data in the workspace
					count = stateWorkspace.states.count;
					count.local = "string" as unknown as TestData;

					const attendee2 = presence.attendees.getAttendee(attendeeId2);
					const remote = stateWorkspace.states.count.getRemote(attendee2);

					// Act & Verify
					assert.equal(validatorFunction.callCount, 0, "call count should be 0");
					let remoteData = remote.value();
					assert.equal(remoteData, undefined);
					assert.equal(validatorFunction.callCount, 1, "call count should be 1");

					// Subsequent calls do not invoke validator
					remoteData = remote.value();
					assert.equal(validatorFunction.callCount, 1, "call count should still be 1");
				});

				describe("is not called", () => {
					it("by .getRemote()", () => {
						// Setup
						const attendee2 = presence.attendees.getAttendee(attendeeId2);

						// Act - Calling getRemote should not invoke the validator (only a value read will).
						count.getRemote(attendee2);

						// Verify
						assert.equal(validatorFunction.callCount, 0);
					});

					it("by local .value()", () => {
						// Setup
						const attendee2 = presence.attendees.getAttendee(attendeeId2);
						const remoteData = count.getRemote(attendee2);

						// Act - Reading the data should cause the validator to get called once.
						const value = remoteData.value();

						// Verify
						assert.equal(value?.num, 11);
						assert.equal(validatorFunction.callCount, 1);
					});
				});

				describe("is called", () => {
					it("on first .value() call", () => {
						// Setup
						const attendee2 = presence.attendees.getAttendee(attendeeId2);
						const remoteData = count.getRemote(attendee2);

						// Act - Reading the data should cause the validator to get called once.
						const value = remoteData.value();

						// Verify
						assert.equal(value?.num, 11);
						assert.equal(validatorFunction.callCount, 1);
					});

					it("only once for multiple .value() calls on unchanged data", () => {
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
				});
			});
		});

		describe("LatestMapValueManager", () => {
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
				describe("is not called", () => {
					it("when referencing a local key value", () => {
						// Act & Verify
						count.local.set("key1", { num: 84 });

						// Getting a local value should not call the validator
						assert.equal(count.local.get("key1")?.num, 84);
						assert.equal(validatorFunction.callCount, 0);
					});

					it("when referencing a map key", () => {
						// Act & Verify
						count.local.set("key1", { num: 84 });
						const attendee2 = presence.attendees.getAttendee(attendeeId2);

						// Getting just the map or its key should not cause the validator to run
						const mapData = count.getRemote(attendee2);
						assert.equal(validatorFunction.callCount, 0);

						mapData.get("key1");
						assert.equal(validatorFunction.callCount, 0);
					});
				});

				describe("is called", () => {
					it("once when key.value() is called", () => {
						// Act & Verify
						count.local.set("key1", { num: 84 });

						const attendee2 = presence.attendees.getAttendee(attendeeId2);
						const mapData = count.getRemote(attendee2);

						// Reading an individual map item's value should cause the validator to get called once.
						assert.equal(mapData.get("key1")?.value()?.num, 84);
						assert.equal(validatorFunction.callCount, 1);
					});

					it("only once for multiple key.value() calls on unchanged data", () => {
						// Act & Verify
						count.local.set("key1", { num: 84 });
						const attendee2 = presence.attendees.getAttendee(attendeeId2);

						// Reading the data should cause the validator to get called once. Since this is a map, we need to read a
						// key value to call the validator.
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
		});
	});
});
