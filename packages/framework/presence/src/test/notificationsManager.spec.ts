/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import type { ISessionClient, NotificationsManager, PresenceNotifications } from "../index.js";
import { Notifications } from "../index.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	assertIdenticalTypes,
	createInstanceOf,
	prepareConnectedPresence,
} from "./testUtils.js";

describe("Presence", () => {
	describe("NotificationsManager", () => {
		// Note: this test setup mimics the setup in src/test/presenceManager.spec.ts
		let runtime: MockEphemeralRuntime;
		let logger: EventAndErrorTrackingLogger;
		const initialTime = 1000;
		let clock: SinonFakeTimers;
		let presence: ReturnType<typeof createPresenceManager>;
		// eslint-disable-next-line @typescript-eslint/ban-types
		let notificationsWorkspace: PresenceNotifications<{}>;

		before(async () => {
			clock = useFakeTimers();
		});

		beforeEach(() => {
			logger = new EventAndErrorTrackingLogger();
			runtime = new MockEphemeralRuntime(logger);

			// We are configuring the runtime to be in a connected state, so ensure it looks connected
			runtime.connected = true;

			clock.setSystemTime(initialTime);

			// Set up the presence connection
			presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);

			// Get a notifications workspace
			notificationsWorkspace = presence.getNotifications("name:testNotificationWorkspace", {});
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

		it("can be created via `Notifications` added to workspace", async () => {
			// Act
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

			// Verify
			assert.notEqual(notificationsWorkspace.props.testEvents, undefined);
			assertIdenticalTypes(
				notificationsWorkspace.props.testEvents,
				createInstanceOf<NotificationsManager<{ newId: (id: number) => void }>>(),
			);
		});

		it("emit.broadcast sends broadcast signal", async () => {
			// Setup
			notificationsWorkspace.add(
				"testEvents",
				Notifications<
					// Below explicit generic specification should not be required.
					{
						newId: (id: number) => void;
					},
					"testEvents"
				>({
					newId: (_client: ISessionClient, _id: number) => {},
				}),
			);

			const { testEvents } = notificationsWorkspace.props;

			clock.tick(10);

			runtime.signalsExpected.push([
				"Pres:DatastoreUpdate",
				{
					"sendTimestamp": 1020,
					"avgLatency": 10,
					"data": {
						"system:presence": {
							"clientToSessionId": {
								"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
							},
						},
						"n:name:testNotificationWorkspace": {
							"testEvents": {
								"sessionId-2": {
									"rev": 0,
									"timestamp": 0,
									"value": { "name": "newId", "args": [42] },
									"ignoreUnmonitored": true,
								},
							},
						},
					},
				},
			]);

			// Act & Verify
			testEvents.emit.broadcast("newId", 42);

			assertFinalExpectations(runtime, logger);
		});

		// TODO: Implement `unicast` method in NotificationsManager and in supporting code.
		it.skip("emit.unicast sends directed signal", async () => {
			// Setup
			notificationsWorkspace.add(
				"testEvents",
				Notifications<
					// Below explicit generic specification should not be required.
					{
						newId: (id: number) => void;
					},
					"testEvents"
				>({
					newId: (_client: ISessionClient, _id: number) => {},
				}),
			);

			const { testEvents } = notificationsWorkspace.props;

			clock.tick(10);

			runtime.signalsExpected.push([
				"Pres:DatastoreUpdate",
				{
					"sendTimestamp": 1020,
					"avgLatency": 10,
					"data": {
						"system:presence": {
							"clientToSessionId": {
								"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
							},
						},
						"n:name:testNotificationWorkspace": {
							"testEvents": {
								"sessionId-2": {
									"rev": 0,
									"timestamp": 0,
									"value": { "name": "newId", "args": [42] },
									"ignoreUnmonitored": true,
								},
							},
						},
					},
				},
				// Targeting self for simplicity
				"client2",
			]);

			// Act & Verify
			testEvents.emit.unicast("newId", presence.getMyself(), 42);

			assertFinalExpectations(runtime, logger);
		});

		it("raises named event when notification is received", async () => {
			type EventCalls = { client: ISessionClient; id: number }[];
			const eventHandlerCalls = {
				original: [] as EventCalls,
				secondary: [] as EventCalls,
				tertiary: [] as EventCalls,
			};

			function originalEventHandler(client: ISessionClient, id: number): void {
				assert.equal(client.sessionId, "sessionId-3");
				assert.equal(id, 42);
				eventHandlerCalls.original.push({ client, id });
			}

			notificationsWorkspace.add(
				"testEvents",
				Notifications<
					// Below explicit generic specification should not be required.
					{
						newId: (id: number) => void;
					},
					"testEvents"
				>({
					newId: originalEventHandler,
				}),
			);

			const { testEvents } = notificationsWorkspace.props;

			testEvents.events.on("unattendedNotification", (name) => {
				fail(`Unexpected unattendedNotification: ${name}`);
			});

			const disconnectFunctions = [
				testEvents.notifications.on("newId", (client: ISessionClient, id: number) => {
					eventHandlerCalls.secondary.push({ client, id });
				}),
				testEvents.notifications.on("newId", (client: ISessionClient, id: number) => {
					eventHandlerCalls.tertiary.push({ client, id });
				}),
			];

			// Processing this signal should trigger the testEvents.newId event listeners
			presence.processSignal(
				"",
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									"client3": { "rev": 0, "timestamp": 1000, "value": "sessionId-3" },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									"sessionId-3": {
										"rev": 0,
										"timestamp": 0,
										"value": { "name": "newId", "args": [42] },
										"ignoreUnmonitored": true,
									},
								},
							},
						},
					},
					clientId: "client3",
				},
				false,
			);

			assert(
				eventHandlerCalls.original.length === 1,
				`original event handler was called ${eventHandlerCalls.original.length} times; expected 1`,
			);
			assert(
				eventHandlerCalls.secondary.length === 1,
				`secondary event handler was called ${eventHandlerCalls.secondary.length} times; expected 1`,
			);
			assert(
				eventHandlerCalls.tertiary.length === 1,
				`secondary event handler was called ${eventHandlerCalls.tertiary.length} times; expected 1`,
			);

			// Cleanup
			for (const disconnect of disconnectFunctions) {
				disconnect();
			}
		});

		it("raises `unattendedEvent` event when unrecognized notification is received", async () => {
			let unattendedEventCalled = false;

			notificationsWorkspace.add(
				"testEvents",
				Notifications<
					// Below explicit generic specification should not be required.
					{
						newId: (id: number) => void;
					},
					"testEvents"
				>({
					newId: (client: ISessionClient, id: number) => {
						fail(`Unexpected newId event`);
					},
				}),
			);

			const { testEvents } = notificationsWorkspace.props;

			testEvents.events.on("unattendedNotification", (name, sender, ...content) => {
				assert.equal(name, "oldId");
				assert.equal(sender.sessionId, "sessionId-3");
				assert.deepEqual(content, [41]);
				assert(!unattendedEventCalled);
				unattendedEventCalled = true;
			});

			// Processing this signal should trigger the testEvents.newId event listeners
			presence.processSignal(
				"",
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									"client3": { "rev": 0, "timestamp": 1000, "value": "sessionId-3" },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									"sessionId-3": {
										"rev": 0,
										"timestamp": 0,
										"value": { "name": "oldId", "args": [41] },
										"ignoreUnmonitored": true,
									},
								},
							},
						},
					},
					clientId: "client3",
				},
				false,
			);

			assert(unattendedEventCalled, "unattendedEvent not called");
		});

		it("raises `unattendedEvent` event when recognized notification is received without listeners", async () => {
			let unattendedEventCalled = false;

			function newIdEventHandler(client: ISessionClient, id: number): void {
				fail(`Unexpected newId event`);
			}

			notificationsWorkspace.add(
				"testEvents",
				Notifications<
					// Below explicit generic specification should not be required.
					{
						newId: (id: number) => void;
					},
					"testEvents"
				>({
					newId: newIdEventHandler,
				}),
			);

			const { testEvents } = notificationsWorkspace.props;

			testEvents.events.on("unattendedNotification", (name, sender, ...content) => {
				assert.equal(name, "newId");
				assert.equal(sender.sessionId, "sessionId-3");
				assert.deepEqual(content, [43]);
				assert(!unattendedEventCalled);
				unattendedEventCalled = true;
			});

			testEvents.notifications.off("newId", newIdEventHandler);

			// Processing this signal should trigger the testEvents.newId event listeners
			presence.processSignal(
				"",
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									"client3": { "rev": 0, "timestamp": 1000, "value": "sessionId-3" },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									"sessionId-3": {
										"rev": 0,
										"timestamp": 0,
										"value": { "name": "newId", "args": [43] },
										"ignoreUnmonitored": true,
									},
								},
							},
						},
					},
					clientId: "client3",
				},
				false,
			);

			assert(unattendedEventCalled, "unattendedEvent not called");
		});

		it("removed listeners are not called when related notification is received", async () => {
			let originalEventHandlerCalled = false;

			function originalEventHandler(client: ISessionClient, id: number): void {
				assert.equal(client.sessionId, "sessionId-3");
				assert.equal(id, 44);
				assert.equal(originalEventHandlerCalled, false);
				originalEventHandlerCalled = true;
			}

			notificationsWorkspace.add(
				"testEvents",
				Notifications<
					// Below explicit generic specification should not be required.
					{
						newId: (id: number) => void;
					},
					"testEvents"
				>({
					newId: originalEventHandler,
				}),
			);

			const { testEvents } = notificationsWorkspace.props;

			testEvents.events.on("unattendedNotification", (name) => {
				fail(`Unexpected unattendedNotification: ${name}`);
			});

			const disconnect = testEvents.notifications.on(
				"newId",
				(_client: ISessionClient, _id: number) => {
					fail(`Unexpected event raised on disconnected listener`);
				},
			);
			// Remove the listener
			disconnect();

			// Act
			presence.processSignal(
				"",
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									"client3": { "rev": 0, "timestamp": 1000, "value": "sessionId-3" },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									"sessionId-3": {
										"rev": 0,
										"timestamp": 0,
										"value": { "name": "newId", "args": [44] },
										"ignoreUnmonitored": true,
									},
								},
							},
						},
					},
					clientId: "client3",
				},
				false,
			);

			// Verify
			assert(originalEventHandlerCalled, "originalEventHandler not called");
		});
	});
});
