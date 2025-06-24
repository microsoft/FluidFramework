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

			// Join attendee2 to the session; tests will act as attendee2
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
				runtime.signalsExpected.push([
					// client2 workspace initialization signal
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
					presence.processSignal(
						[],
						// Signal is equivalent to `count.local = { num: 11 };`
						{
							"type": "Pres:DatastoreUpdate",
							"clientId": connectionId2,
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
						false,
					);
				});

				describe("is not called", () => {
					it("by .getRemote()", () => {
						// Calling getRemote should not invoke the validator (only a value read will).
						stateWorkspace.states.count.getRemote(attendee2);

						assert.equal(validatorFunction.callCount, 0);
					});

					it("by local .value()", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						// Reading the data should cause the validator to get called once.
						const value = remoteData.value();

						assert.equal(value?.num, 11);
						assert.equal(validatorFunction.callCount, 1);
					});
				});

				describe("is called", () => {
					it("on first .value() call", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						const value = remoteData.value();

						assert.equal(value?.num, 11);
						assert.equal(validatorFunction.callCount, 1);
					});

					it("only once for multiple .value() calls on unchanged data", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);
						// Reading the data should cause the validator to get called once.
						assert.equal(remoteData.value()?.num, 11);
						assert.equal(validatorFunction.callCount, 1);

						// Subsequent reads should not call the validator when there is no new data.
						assert.equal(remoteData.value()?.num, 11);
						assert.equal(validatorFunction.callCount, 1);
					});
				});

				it("returns undefined through proxied value accessor when remote data is invalid", () => {
					presence.processSignal(
						[],
						// Send invalid data. Equivalent to `count.local = "string" as unknown as TestData;`
						{
							"type": "Pres:DatastoreUpdate",
							"clientId": connectionId2,
							"content": {
								"sendTimestamp": 1030,
								"avgLatency": 11,
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
						false,
					);

					const remoteData = stateWorkspace.states.count.getRemote(attendee2);

					assert.equal(validatorFunction.callCount, 0, "call count should be 0");
					assert.equal(remoteData.value(), undefined);
					assert.equal(validatorFunction.callCount, 1, "call count should be 1");

					// Subsequent calls do not invoke validator
					remoteData.value();
					assert.equal(validatorFunction.callCount, 1, "call count should still be 1");
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
				runtime.signalsExpected.push([
					// Workspace initialization signal
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
				]);

				stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { "key1": { num: 0 } },
						validator: validatorFunction,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				presence.processSignal(
					[],
					// Equivalent to `stateWorkspace.states.count.local.set("key1", { num: 84 });`
					{
						type: "Pres:DatastoreUpdate",
						clientId: connectionId2,
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
					false,
				);
			});

			describe("validator", () => {
				describe("is not called", () => {
					it("when referencing a local key value", () => {
						// Getting a local value should not call the validator
						assert.equal(stateWorkspace.states.count.local.get("key1")?.num, 84);
						assert.equal(validatorFunction.callCount, 0);
					});

					it("when referencing a map key", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);

						remoteData.get("key1");
						assert.equal(validatorFunction.callCount, 0);
					});
				});

				describe("is called", () => {
					it("once when key.value() is called", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);

						// Reading an individual map item's value should cause the validator to get called once.
						assert.equal(remoteData.get("key1")?.value()?.num, 84);
						assert.equal(validatorFunction.callCount, 1);
					});

					it("only once for multiple key.value() calls on unchanged data", () => {
						const remoteData = stateWorkspace.states.count.getRemote(attendee2);

						let keyData = remoteData.get("key1")?.value();
						assert.equal(keyData?.num, 84);

						// Subsequent reads should not call the validator when there is no new data.
						keyData = remoteData.get("key1")?.value();
						keyData = remoteData.get("key1")?.value();
						assert.equal(validatorFunction.callCount, 1);
					});
				});
			});
		});
	});
});
