/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { toOpaqueJson } from "../internalUtils.js";
import type { LatestMapArguments } from "../latestMapValueManager.js";
import type { StateSchemaValidator } from "../latestValueTypes.js";
import type { AttendeeId } from "../presence.js";
import type { createPresenceManager } from "../presenceManager.js";
import { StateFactory } from "../stateFactory.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	attendeeId1,
	attendeeId2,
	connectionId1,
	connectionId2,
	createNullValidator,
	createSpiedValidator,
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
							"system:presence": {
								"clientToSessionId": {
									[connectionId2]: {
										"rev": 0,
										"timestamp": 700,
										"value": attendeeId2,
									},
								},
							},
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

		afterEach(() => {
			for (const cleanUp of afterCleanUp) {
				cleanUp();
			}
			afterCleanUp.length = 0;
		});

		describe("LatestValueManager", () => {
			let validatorFunction: StateSchemaValidator<TestData>;
			let validatorSpy: ValidatorSpy;

			beforeEach(() => {
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"sendTimestamp": 1030,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId2]: { "rev": 0, "timestamp": 1010, "value": attendeeId2 },
									},
								},
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

				[validatorFunction, validatorSpy] = createSpiedValidator<TestData>(
					createNullValidator(),
				);

				assert.equal(validatorSpy.callCount, 0);
			});

			it("getRemote does not call validator", () => {
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
										[connectionId2]: { "rev": 0, "timestamp": 1010, "value": attendeeId2 },
									},
								},
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

				const attendee2 = presence.attendees.getAttendee(attendeeId2);

				// Calling getRemote should not invoke the validator (only a value read will).
				count.getRemote(attendee2);

				assert.equal(validatorSpy.callCount, 0);
			});

			it("calls validator when data is read", () => {
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
										[connectionId2]: { "rev": 0, "timestamp": 1010, "value": attendeeId2 },
									},
								},
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

				const attendee2 = presence.attendees.getAttendee(attendeeId2);

				// Calling getRemote should not invoke the validator (only a value read will).
				const remoteData = count.getRemote(attendee2);
				const value = remoteData.value();

				// Reading the data should cause the validator to get called once.
				assert.equal(value?.num, 11);
				assert.equal(validatorSpy.callCount, 1);
			});

			it("calls validator only once if data is unchanged", () => {
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
										[connectionId2]: { "rev": 0, "timestamp": 1010, "value": attendeeId2 },
									},
								},
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

				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;
				count.local = { num: 11 };

				// Act & Verify
				const attendee2 = presence.attendees.getAttendee(attendeeId2);

				// Calling getRemote should not invoke the validator (only a value read will).
				const remoteData = count.getRemote(attendee2);

				// Reading the data should cause the validator to get called once.
				assert.equal(remoteData.value()?.num, 11);
				assert.equal(validatorSpy.callCount, 1);

				// Subsequent reads should not call the validator when there is no new data.
				assert.equal(remoteData.value()?.num, 11);
				assert.equal(validatorSpy.callCount, 1);
			});

			it("returns undefined with invalid data", () => {
				// Setup
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"sendTimestamp": 1030,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId2]: { "rev": 0, "timestamp": 1010, "value": attendeeId2 },
									},
								},
								"s:name:testStateWorkspace": {
									"count": {
										[attendeeId2]: {
											"rev": 1,
											"timestamp": 1030,
											"value": toOpaqueJson("string"),
										},
									},
								},
							},
						},
					},
				]);

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
				const attendee2 = presence.attendees.getAttendee(attendeeId2);

				// Calling getRemote should not invoke the validator (only a value read will).
				const remoteData = count.getRemote(attendee2);
				assert.equal(spy.callCount, 0);

				// Subsequent reads should not call the validator when there is no new data.
				assert.equal(remoteData.value(), undefined);
				assert.equal(spy.callCount, 1);
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
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"sendTimestamp": 1030,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId1]: { "rev": 0, "timestamp": 1020, "value": attendeeId1 },
									},
								},
								"s:name:testStateWorkspace": {
									"count": {
										[attendeeId1]: {
											"rev": 0,
											"timestamp": 1030,
											"value": toOpaqueJson({ "key1": { "num": 84 } }),
										},
									},
								},
							},
						},
					},
				]);

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

				const attendee2 = presence.attendees.getAttendee(attendeeId2);

				// Getting just the map or its key should not cause the validator to run
				const mapData = count.getRemote(attendee2);
				assert.equal(validatorSpy.callCount, 0);

				mapData.get("key1");
				assert.equal(validatorSpy.callCount, 0);
			});

			it("calls validator when key value is read", () => {
				// Setup
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"sendTimestamp": 1030,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId1]: { "rev": 0, "timestamp": 1020, "value": attendeeId1 },
									},
								},
								"s:name:testStateWorkspace": {
									"count": {
										[attendeeId1]: {
											"rev": 0,
											"timestamp": 1030,
											"value": toOpaqueJson({ "key1": { "num": 22 } }),
										},
									},
								},
							},
						},
					},
				]);

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

				const attendee2 = presence.attendees.getAttendee(attendeeId2);
				const mapData = count.getRemote(attendee2);

				// Reading an individual map item's value should cause the validator to get called once.
				assert.equal(mapData.get("key1")?.value()?.num, 22);
				assert.equal(validatorSpy.callCount, 1);
			});

			it("calls validator only once for the same key value", () => {
				// Setup
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"sendTimestamp": 1030,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId1]: { "rev": 0, "timestamp": 1020, "value": attendeeId1 },
									},
								},
								"s:name:testStateWorkspace": {
									"count": {
										[attendeeId1]: {
											"rev": 0,
											"timestamp": 1030,
											"value": toOpaqueJson({ "key1": { "num": 11 } }),
										},
									},
								},
							},
						},
					},
				]);

				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { "key1": { num: 0 } },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					} satisfies LatestMapArguments<{ num: number }, string>),
				});

				const { count } = stateWorkspace.states;
				count.local.set("key1", { num: 11 });

				const attendee2 = presence.attendees.getAttendee(attendeeId2);

				// Act & Verify
				// Reading the data should cause the validator to get called once. Since this is a map, we need to read a key
				// value to call the validator.
				const remoteData = count.getRemote(attendee2);

				let keyData = remoteData.get("key1")?.value();

				// Subsequent reads should not call the validator when there is no new data.
				keyData = remoteData.get("key1")?.value();
				keyData = remoteData.get("key1")?.value();
				assert.equal(validatorSpy.callCount, 1);
				assert.equal(keyData?.num, 11);
			});
		});
	});
});
