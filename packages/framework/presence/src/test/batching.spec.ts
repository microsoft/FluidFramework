/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import type { NotificationsWorkspace } from "../index.js";
import { Notifications, StateFactory } from "../index.js";
import { serializableToOpaqueJson } from "../internalUtils.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	connectionId2,
	prepareConnectedPresence,
	attendeeId2,
} from "./testUtils.js";

describe("Presence", () => {
	describe("batching", () => {
		let runtime: MockEphemeralRuntime;
		let logger: EventAndErrorTrackingLogger;
		const initialTime = 1000;
		let clock: SinonFakeTimers;
		let presence: ReturnType<typeof createPresenceManager>;

		before(async () => {
			clock = useFakeTimers();
		});

		beforeEach(() => {
			logger = new EventAndErrorTrackingLogger();
			runtime = new MockEphemeralRuntime(logger);

			// Note that while the initialTime is set to 1000, the prepareConnectedPresence call advances
			// it to 1010 so all tests start at that time.
			clock.setSystemTime(initialTime);

			// Set up the presence connection.
			presence = prepareConnectedPresence(runtime, attendeeId2, connectionId2, clock, logger);
		});

		afterEach(() => {
			// Tick the clock forward by a large amount before resetting it
			// in case there are lingering queued signals or timers
			clock.tick(1000);
			clock.reset();
		});

		after(() => {
			clock.restore();
		});

		describe("Latest", () => {
			it("sends signal immediately when allowable latency is 0", async () => {
				runtime.signalsExpected.push(
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1010,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 0,
												"timestamp": 1010,
												"value": serializableToOpaqueJson({
													"num": 0,
												}),
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
								"sendTimestamp": 1020,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 1,
												"timestamp": 1020,
												"value": serializableToOpaqueJson({
													"num": 42,
												}),
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
								"sendTimestamp": 1020,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 2,
												"timestamp": 1020,
												"value": serializableToOpaqueJson({
													"num": 84,
												}),
											},
										},
									},
								},
							},
						},
					],
				);

				// Configure a state workspace
				// SIGNAL #1 - intial data is sent immediately
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count } = stateWorkspace.states;

				clock.tick(10); // Time is now 1020

				// SIGNAL #2
				count.local = { num: 42 };

				// SIGNAL #3
				count.local = { num: 84 };

				assertFinalExpectations(runtime, logger);
			});

			it("sets timer for default allowableUpdateLatency", async () => {
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"sendTimestamp": 1070,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId2]: {
											"rev": 0,
											"timestamp": 1000,
											"value": serializableToOpaqueJson(attendeeId2),
										},
									},
								},
								"s:name:testStateWorkspace": {
									"count": {
										[attendeeId2]: {
											"rev": 0,
											"timestamp": 1010,
											"value": serializableToOpaqueJson({
												"num": 0,
											}),
										},
									},
								},
							},
						},
					},
				]);

				// Configure a state workspace
				presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 } /* default allowableUpdateLatencyMs = 60 */,
					}),
				}); // will be queued; deadline is now 1070

				// SIGNAL #1
				// The deadline timer will fire at time 1070 and send a single
				// signal with the value from the last signal (num=0).

				clock.tick(100); // Time is now 1110
			});

			it("batches signals sent within default allowableUpdateLatency", async () => {
				runtime.signalsExpected.push(
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1070,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 3,
												"timestamp": 1060,
												"value": serializableToOpaqueJson({
													"num": 22,
												}),
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
								"sendTimestamp": 1150,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 6,
												"timestamp": 1140,
												"value": serializableToOpaqueJson({
													"num": 90,
												}),
											},
										},
									},
								},
							},
						},
					],
				);

				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 } /* default allowableUpdateLatencyMs = 60 */,
					}),
				}); // will be queued; deadline is now 1070

				const { count } = stateWorkspace.states;

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued; deadline remains 1070

				clock.tick(10); // Time is now 1030
				count.local = { num: 34 }; // will be queued; deadline remains 1070

				clock.tick(30); // Time is now 1060
				count.local = { num: 22 }; // will be queued; deadline remains 1070

				// SIGNAL #1
				// The deadline timer will fire at time 1070 and send a single
				// signal with the value from the last signal (num=22).

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(20); // Time is now 1080

				clock.tick(10); // Time is now 1090
				count.local = { num: 56 }; // will be queued; deadline is set to 1150

				clock.tick(40); // Time is now 1130
				count.local = { num: 78 }; // will be queued; deadline remains 1150

				clock.tick(10); // Time is now 1140
				count.local = { num: 90 }; // will be queued; deadline remains 1150

				// SIGNAL #2
				// The deadline timer will fire at time 1150 and send a single
				// signal with the value from the last signal (num=90).

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1180
			});

			it("batches signals sent within a specified allowableUpdateLatency", async () => {
				runtime.signalsExpected.push(
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1110,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 2,
												"timestamp": 1100,
												"value": serializableToOpaqueJson({
													"num": 34,
												}),
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
								"sendTimestamp": 1240,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 5,
												"timestamp": 1220,
												"value": serializableToOpaqueJson({
													"num": 90,
												}),
											},
										},
									},
								},
							},
						},
					],
				);

				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						settings: { allowableUpdateLatencyMs: 100 },
					}),
				});

				const { count } = stateWorkspace.states;

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued; deadline is set to 1120

				clock.tick(80); // Time is now 1100
				count.local = { num: 34 }; // will be queued; deadline remains 1120

				// SIGNAL #1
				// The deadline timer will fire at time 1120 and send a single
				// signal with the value from the last signal (num=34).

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1130

				clock.tick(10); // Time is now 1140
				count.local = { num: 56 }; // will be queued; deadline is set to 1240

				clock.tick(40); // Time is now 1180
				count.local = { num: 78 }; // will be queued; deadline remains 1240

				clock.tick(40); // Time is now 1220
				count.local = { num: 90 }; // will be queued; deadline remains 1240

				// SIGNAL #2
				// The deadline timer will fire at time 1240 and send a single
				// signal with the value from the last signal (num=90).

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1250
			});

			it("queued signal is sent immediately with immediate update message", async () => {
				runtime.signalsExpected.push(
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1010,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 0,
												"timestamp": 1010,
												"value": serializableToOpaqueJson({
													"num": 0,
												}),
											},
										},
										"immediateUpdate": {
											[attendeeId2]: {
												"rev": 0,
												"timestamp": 1010,
												"value": serializableToOpaqueJson({
													"num": 0,
												}),
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
								"sendTimestamp": 1110,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 2,
												"timestamp": 1100,
												"value": serializableToOpaqueJson({
													"num": 34,
												}),
											},
										},
										"immediateUpdate": {
											[attendeeId2]: {
												"rev": 1,
												"timestamp": 1110,
												"value": serializableToOpaqueJson({
													"num": 56,
												}),
											},
										},
									},
								},
							},
						},
					],
				);

				// Configure a state workspace
				// SIGNAL #1 - this signal is not queued because it contains a State object with a latency of 0,
				// so the initial data will be sent immediately.
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						settings: { allowableUpdateLatencyMs: 100 },
					}),
					immediateUpdate: StateFactory.latest({
						local: { num: 0 },
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				const { count, immediateUpdate } = stateWorkspace.states;

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued; deadline is set to 1120

				clock.tick(80); // Time is now 1100
				count.local = { num: 34 }; // will be queued; deadline remains 1120

				clock.tick(10); // Time is now 1110

				// SIGNAL #2
				// The following update should cause the queued signals to be merged with this immediately-sent
				// signal with the value from the last signal (num=34).
				immediateUpdate.local = { num: 56 };
			});

			it("batches signals with different allowed latencies", async () => {
				runtime.signalsExpected.push(
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1060,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 2,
												"timestamp": 1050,
												"value": serializableToOpaqueJson({
													"num": 34,
												}),
											},
										},
										"note": {
											[attendeeId2]: {
												"rev": 1,
												"timestamp": 1020,
												"value": serializableToOpaqueJson({
													"message": "will be queued",
												}),
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
								"sendTimestamp": 1110,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"note": {
											[attendeeId2]: {
												"rev": 2,
												"timestamp": 1060,
												"value": serializableToOpaqueJson({ "message": "final message" }),
											},
										},
									},
								},
							},
						},
					],
				);

				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						settings: { allowableUpdateLatencyMs: 100 },
					}),
					note: StateFactory.latest({
						local: { message: "" },
						settings: { allowableUpdateLatencyMs: 50 },
					}),
				}); // will be queued, deadline is set to 1060

				const { count, note } = stateWorkspace.states;

				clock.tick(10); // Time is now 1020
				note.local = { message: "will be queued" }; // will be queued, deadline remains 1060
				count.local = { num: 12 }; // will be queued; deadline remains 1060

				clock.tick(30); // Time is now 1050
				count.local = { num: 34 }; // will be queued; deadline remains 1060

				// SIGNAL #1
				// At time 1060, the deadline timer will fire and send a single signal with the value
				// from both workspaces (num=34, message="will be queued").

				clock.tick(10); // Time is now 1060
				note.local = { message: "final message" }; // will be queued; deadline is 1110

				// SIGNAL #2
				// At time 1110, the deadline timer will fire and send a single signal with the value
				// from the note workspace (message="final message").

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(100); // Time is now 1160
			});

			it("batches signals from multiple workspaces", async () => {
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"sendTimestamp": 1070,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId2]: {
											"rev": 0,
											"timestamp": 1000,
											"value": serializableToOpaqueJson(attendeeId2),
										},
									},
								},
								"s:name:testStateWorkspace": {
									"count": {
										[attendeeId2]: {
											"rev": 2,
											"timestamp": 1050,
											"value": serializableToOpaqueJson({
												"num": 34,
											}),
										},
									},
								},
								"s:name:testStateWorkspace2": {
									"note": {
										[attendeeId2]: {
											"rev": 2,
											"timestamp": 1060,
											"value": serializableToOpaqueJson({
												"message": "final message",
											}),
										},
									},
								},
							},
						},
					},
				]);

				// Configure two state workspaces
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						settings: { allowableUpdateLatencyMs: 100 },
					}),
				}); // will be queued, deadline is 1110

				const stateWorkspace2 = presence.states.getWorkspace("name:testStateWorkspace2", {
					note: StateFactory.latest({
						local: { message: "" },
						settings: { allowableUpdateLatencyMs: 60 },
					}),
				}); // will be queued, deadline is 1070

				const { count } = stateWorkspace.states;
				const { note } = stateWorkspace2.states;

				clock.tick(10); // Time is now 1020
				note.local = { message: "will be queued" }; // will be queued, deadline is 1070
				count.local = { num: 12 }; // will be queued; deadline remains 1070

				clock.tick(30); // Time is now 1050
				count.local = { num: 34 }; // will be queued; deadline remains 1070

				clock.tick(10); // Time is now 1060
				note.local = { message: "final message" }; // will be queued; deadline remains 1070

				// SIGNAL #1
				// The deadline timer will fire at time 1070 and send a single
				// signal with the values from the most recent workspace updates (num=34, message="final message").

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1090
			});
		});

		describe("NotificationsManager", () => {
			it("notification signals are sent immediately", async () => {
				runtime.signalsExpected.push(
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1050,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"n:name:testNotificationWorkspace": {
										"testEvents": {
											[attendeeId2]: {
												"rev": 0,
												"timestamp": 0,
												"value": serializableToOpaqueJson({ "name": "newId", "args": [77] }),
												"ignoreUnmonitored": true,
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
								"sendTimestamp": 1060,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"n:name:testNotificationWorkspace": {
										"testEvents": {
											[attendeeId2]: {
												"rev": 0,
												"timestamp": 0,
												"value": serializableToOpaqueJson({ "name": "newId", "args": [88] }),
												"ignoreUnmonitored": true,
											},
										},
									},
								},
							},
						},
					],
				);

				// Configure a notifications workspace
				// eslint-disable-next-line @typescript-eslint/ban-types
				const notificationsWorkspace: NotificationsWorkspace<{}> =
					presence.notifications.getWorkspace("name:testNotificationWorkspace", {});

				notificationsWorkspace.add(
					"testEvents",
					Notifications<
						// Below explicit generic specification should not be required.
						{
							newId: (id: number) => void;
						},
						"testEvents"
					>(
						// A default handler is not required
						{},
					),
				);

				const { testEvents } = notificationsWorkspace.notifications;

				clock.tick(40); // Time is now 1050

				// SIGNAL #1
				testEvents.emit.broadcast("newId", 77);

				clock.tick(10); // Time is now 1060

				// SIGNAL #2
				testEvents.emit.broadcast("newId", 88);
			});

			it("notification signals cause queued messages to be sent immediately", async () => {
				runtime.signalsExpected.push(
					[
						{
							type: "Pres:DatastoreUpdate",
							content: {
								"sendTimestamp": 1060,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"s:name:testStateWorkspace": {
										"count": {
											[attendeeId2]: {
												"rev": 3,
												"timestamp": 1040,
												"value": serializableToOpaqueJson({
													"num": 56,
												}),
											},
										},
									},
									"n:name:testNotificationWorkspace": {
										"testEvents": {
											[attendeeId2]: {
												"rev": 0,
												"timestamp": 0,
												"value": serializableToOpaqueJson({
													"name": "newId",
													"args": [99],
												}),
												"ignoreUnmonitored": true,
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
								"sendTimestamp": 1090,
								"avgLatency": 10,
								"data": {
									"system:presence": {
										"clientToSessionId": {
											[connectionId2]: {
												"rev": 0,
												"timestamp": 1000,
												"value": serializableToOpaqueJson(attendeeId2),
											},
										},
									},
									"n:name:testNotificationWorkspace": {
										"testEvents": {
											[attendeeId2]: {
												"rev": 0,
												"timestamp": 0,
												"value": serializableToOpaqueJson({
													"name": "newId",
													"args": [111],
												}),
												"ignoreUnmonitored": true,
											},
										},
									},
								},
							},
						},
					],
				);

				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest({
						local: { num: 0 },
						settings: { allowableUpdateLatencyMs: 100 },
					}),
				}); // will be queued, deadline is 1110

				// eslint-disable-next-line @typescript-eslint/ban-types
				const notificationsWorkspace: NotificationsWorkspace<{}> =
					presence.notifications.getWorkspace("name:testNotificationWorkspace", {});

				notificationsWorkspace.add(
					"testEvents",
					Notifications<
						// Below explicit generic specification should not be required.
						{
							newId: (id: number) => void;
						},
						"testEvents"
					>(
						// A default handler is not required
						{},
					),
				);

				const { count } = stateWorkspace.states;
				const { testEvents } = notificationsWorkspace.notifications;

				testEvents.notifications.on("newId", (attendee, newId) => {
					// do nothing
				});

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued, deadline remains 1110

				clock.tick(10); // Time is now 1030
				count.local = { num: 34 }; // will be queued, deadline remains 1110

				clock.tick(10); // Time is now 1040
				count.local = { num: 56 }; // will be queued, deadline remains 1110

				clock.tick(20); // Time is now 1060

				// SIGNAL #1
				// The notification below will cause an immediate broadcast of the queued signal
				// along with the notification signal.
				testEvents.emit.broadcast("newId", 99);

				clock.tick(30); // Time is now 1090

				// SIGNAL #2
				// Immediate broadcast of the notification signal.
				testEvents.emit.broadcast("newId", 111);
			});
		});
	});
});
