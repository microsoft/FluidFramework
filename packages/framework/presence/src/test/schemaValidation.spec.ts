/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { StateFactory, type StateSchemaValidator } from "../index.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	createNullValidator,
	createSpiedValidator,
	// generateBasicClientJoin,
	prepareConnectedPresence,
	type ValidatorSpy,
} from "./testUtils.js";

describe("Presence", () => {
	let runtime: MockEphemeralRuntime;
	let logger: EventAndErrorTrackingLogger;
	const initialTime = 1000;
	let clock: SinonFakeTimers;

	before(async () => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		logger = new EventAndErrorTrackingLogger();
		runtime = new MockEphemeralRuntime(logger);
		clock.setSystemTime(initialTime);
	});

	afterEach(function (done: Mocha.Done) {
		clock.reset();

		// If the test passed so far, check final expectations.
		if (this.currentTest?.state === "passed") {
			assertFinalExpectations(runtime, logger);
		}
		done();
	});

	after(() => {
		clock.restore();
	});

	describe("schema validation", () => {
		let presence: ReturnType<typeof createPresenceManager>;
		const afterCleanUp: (() => void)[] = [];
		interface TestData {
			num: number;
		}

		beforeEach(() => {
			presence = prepareConnectedPresence(runtime, "attendeeId-2", "client2", clock, logger);

			// Pass a little time (to mimic reality)
			clock.tick(10);
		});

		afterEach(() => {
			for (const cleanUp of afterCleanUp) {
				cleanUp();
			}
			afterCleanUp.length = 0;
		});

		describe("multiple users", () => {
			beforeEach(() => {});

			it("connects", () => {
				runtime.signalsExpected.push([
					"Pres:DatastoreUpdate",
					{
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									"client2": {
										"rev": 0,
										"timestamp": initialTime,
										"value": "attendeeId-2",
									},
								},
							},
						},
						"isComplete": true,
						"sendTimestamp": clock.now,
					},
				]);

				presence.processSignal(
					"",
					{
						type: "Pres:ClientJoin",
						content: {
							sendTimestamp: clock.now - 50,
							avgLatency: 50,
							data: {},
							updateProviders: ["client2"],
						},
						clientId: "client4",
					},
					false,
				);

				// Join a second user
				// const joinSignal = generateBasicClientJoin(initialTime + 50, {
				// 	attendeeId: "attendeeId-3",
				// 	clientConnectionId: "client3",
				// 	updateProviders: ["client2"],
				// });
				// runtime.signalsExpected.push([joinSignal.type, joinSignal.content]);
				// runtime.submitSignal(joinSignal.type, joinSignal.content);
			});
		});

		describe("LatestValueManager", () => {
			let validatorFunction: StateSchemaValidator<TestData>;
			let validatorSpy: ValidatorSpy;

			beforeEach(() => {
				// Ignore submitted signals
				runtime.submitSignal = () => {};

				[validatorFunction, validatorSpy] = createSpiedValidator<TestData>(
					createNullValidator(),
				);

				assert.equal(validatorSpy.callCount, 0);
			});

			it("getRemote does not call validator", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 } satisfies TestData,
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;

				// Act & Verify
				count.local = { num: 11 };

				// Calling getRemote should not invoke the validator (only a value read will).
				count.getRemote(presence.attendees.getMyself());

				assert.equal(validatorSpy.callCount, 0);
			});

			it("calls validator when data is read", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 } satisfies TestData,
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;

				// Act & Verify
				count.local = { num: 11 };

				// Call getRemote instead of .local so that the validator is called.
				const remoteData = count.getRemote(presence.attendees.getMyself());
				const value = remoteData.value();

				// Reading the data should cause the validator to get called once.
				assert.equal(value?.num, 11);
				assert.equal(validatorSpy.callCount, 1);
			});

			it("calls validator only once for the same data", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;
				count.local = { num: 22 };

				// Act & Verify
				// Call getRemote instead of .local so that the validator is called.
				const remoteData = count.getRemote(presence.attendees.getMyself());

				// Reading the data should cause the validator to get called once.
				assert.equal(remoteData.value()?.num, 22);
				assert.equal(validatorSpy.callCount, 1);

				// Subsequent reads should not call the validator when there is no new data.
				assert.equal(remoteData.value()?.num, 22);
				assert.equal(validatorSpy.callCount, 1);
			});

			it("returns undefined with invalid data", () => {
				// Setup
				const [validator, spy] = createSpiedValidator((d: unknown) =>
					typeof d === "object" ? (d as { num: number }) : undefined,
				);
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						validator,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;
				count.local = "string" as unknown as { num: number };

				// Act & Verify
				const remoteData = count.getRemote(presence.attendees.getMyself());
				assert.equal(spy.callCount, 0);

				// Subsequent reads should not call the validator when there is no new data.
				assert.equal(remoteData.value(), undefined);
				assert.equal(spy.callCount, 1);
			});

			// FIXME: skipped test
			it.skip("invalidates data on update", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;
				count.local = { num: 22 };

				// Act & Verify
				// Call getRemote instead of .local so that the validator is called.
				const remoteData = count.getRemote(presence.attendees.getMyself());

				// Reading the data should cause the validator to get called once.
				assert.equal(remoteData.value()?.num, 22);
				assert.equal(validatorSpy.callCount, 1);

				count.local = { num: 33 };

				// Validator will be called again because the value changed.
				assert.equal(remoteData.value()?.num, 33, "Second value read failed");
				assert.equal(validatorSpy.callCount, 2);
			});
		});

		describe("LatestMapValueManager", () => {
			let validatorFunction: StateSchemaValidator<{ num: number }>;
			let validatorSpy: ValidatorSpy;

			beforeEach(() => {
				// Ignore submitted signals
				runtime.submitSignal = () => {};

				[validatorFunction, validatorSpy] = createSpiedValidator<{ num: number }>(
					createNullValidator(),
				);

				assert.equal(validatorSpy.callCount, 0);
			});

			it("does not call validator when referencing map key", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { "key1": { num: 0 } },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;

				// Act & Verify
				count.local.set("key1", { num: 84 });

				// Getting just the map or its key should not cause the validator to run
				const mapData = count.getRemote(presence.attendees.getMyself());
				assert.equal(validatorSpy.callCount, 0);

				mapData.get("key1");
				assert.equal(validatorSpy.callCount, 0);
			});

			it("calls validator when key value is read", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { "key1": { num: 0 } },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;

				// Act & Verify
				count.local.set("key1", { num: 22 });

				const mapData = count.getRemote(presence.attendees.getMyself());

				// Reading an individual map item's value should cause the validator to get called once.
				assert.equal(mapData.get("key1")?.value()?.num, 22);
				assert.equal(validatorSpy.callCount, 1);
			});

			it("calls validator only once for the same key value", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { "key1": { num: 0 } },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;
				count.local.set("key1", { num: 11 });

				// Act & Verify
				// Reading the data should cause the validator to get called once. Since this is a map, we need to read a key
				// value to call the validator.
				const remoteData = count.getRemote(presence.attendees.getMyself());

				let keyData = remoteData.get("key1")?.value();

				// Subsequent reads should not call the validator when there is no new data.
				keyData = remoteData.get("key1")?.value();
				keyData = remoteData.get("key1")?.value();
				assert.equal(validatorSpy.callCount, 1);
				assert.equal(keyData?.num, 11);
			});

			it.skip("invalidates data when key is set", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { "key1": { num: 0 } satisfies TestData },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;
				count.local.set("key1", { num: 11 });

				// Act & Verify
				// Reading the data should cause the validator to get called once. Since this is a map, we need to read a key
				// value to call the validator.
				const remoteData = count.getRemote(presence.attendees.getMyself());

				let keyData = remoteData.get("key1")?.value();

				// Subsequent reads should not call the validator when there is no new data.
				keyData = remoteData.get("key1")?.value();
				keyData = remoteData.get("key1")?.value();
				assert.equal(validatorSpy.callCount, 1);
				assert.equal(keyData?.num, 11);

				count.local.set("key1", { num: 22 });

				keyData = remoteData.get("key1")?.value();
				keyData = remoteData.get("key1")?.value();
				assert.equal(validatorSpy.callCount, 2);
				assert.equal(keyData?.num, 22);
			});
		});
	});
});
