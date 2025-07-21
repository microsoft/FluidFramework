/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers } from "sinon";

import type {
	Attendee,
	ClientConnectionId,
	NotificationsManager,
	NotificationsWorkspace,
	PresenceWithNotifications,
} from "../index.js";
import { Notifications } from "../index.js";
import { toOpaqueJson } from "../internalUtils.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import type { ProcessSignalFunction } from "./testUtils.js";
import {
	assertFinalExpectations,
	assertIdenticalTypes,
	connectionId2,
	createInstanceOf,
	createSpecificAttendeeId,
	prepareConnectedPresence,
	attendeeId2,
} from "./testUtils.js";

const attendeeId3 = createSpecificAttendeeId("attendeeId-3");
const connectionId3 = "client3" as const satisfies ClientConnectionId;

describe("Presence", () => {
	describe("NotificationsManager", () => {
		// Note: this test setup mimics the setup in src/test/presenceManager.spec.ts
		let runtime: MockEphemeralRuntime;
		let logger: EventAndErrorTrackingLogger;
		const initialTime = 1000;
		let clock: SinonFakeTimers;
		let presence: PresenceWithNotifications;
		let processSignal: ProcessSignalFunction;
		// eslint-disable-next-line @typescript-eslint/ban-types
		let notificationsWorkspace: NotificationsWorkspace<{}>;

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
			({ presence, processSignal } = prepareConnectedPresence(
				runtime,
				"attendeeId-2",
				"client2",
				clock,
				logger,
			));

			// Get a notifications workspace
			notificationsWorkspace = presence.notifications.getWorkspace(
				"name:testNotificationWorkspace",
				{},
			);
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
					// Below explicit generic specification should not be required
					// when default handler is specified.
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
			assert.notEqual(notificationsWorkspace.notifications.testEvents, undefined);
			assertIdenticalTypes(
				notificationsWorkspace.notifications.testEvents,
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
					newId: (_attendee: Attendee, _id: number) => {},
				}),
			);

			const { testEvents } = notificationsWorkspace.notifications;

			clock.tick(10);

			runtime.signalsExpected.push([
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									[connectionId2]: { "rev": 0, "timestamp": 1000, "value": attendeeId2 },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									[attendeeId2]: {
										"rev": 0,
										"timestamp": 0,
										"value": toOpaqueJson({ "name": "newId", "args": [42] }),
										"ignoreUnmonitored": true,
									},
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
					newId: (_attendee: Attendee, _id: number) => {},
				}),
			);

			const { testEvents } = notificationsWorkspace.notifications;

			clock.tick(10);

			runtime.signalsExpected.push([
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									[connectionId2]: { "rev": 0, "timestamp": 1000, "value": attendeeId2 },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									[attendeeId2]: {
										"rev": 0,
										"timestamp": 0,
										"value": toOpaqueJson({ "name": "newId", "args": [42] }),
										"ignoreUnmonitored": true,
									},
								},
							},
						},
					},
					// Targeting self for simplicity
					targetClientId: "client2",
				},
			]);

			// Act & Verify
			testEvents.emit.unicast("newId", presence.attendees.getMyself(), 42);

			assertFinalExpectations(runtime, logger);
		});

		it("raises named event when notification is received", async () => {
			type EventCalls = { attendee: Attendee; id: number }[];
			const eventHandlerCalls = {
				original: [] as EventCalls,
				secondary: [] as EventCalls,
				tertiary: [] as EventCalls,
			};

			function originalEventHandler(attendee: Attendee, id: number): void {
				assert.equal(attendee.attendeeId, attendeeId3);
				assert.equal(id, 42);
				eventHandlerCalls.original.push({ attendee, id });
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

			const { testEvents } = notificationsWorkspace.notifications;

			testEvents.events.on("unattendedNotification", (name) => {
				fail(`Unexpected unattendedNotification: ${name}`);
			});

			const disconnectFunctions = [
				testEvents.notifications.on("newId", (attendee: Attendee, id: number) => {
					eventHandlerCalls.secondary.push({ attendee, id });
				}),
				testEvents.notifications.on("newId", (attendee: Attendee, id: number) => {
					eventHandlerCalls.tertiary.push({ attendee, id });
				}),
			];

			// Processing this signal should trigger the testEvents.newId event listeners
			processSignal(
				[],
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									[connectionId3]: { "rev": 0, "timestamp": 1000, "value": attendeeId3 },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									[attendeeId3]: {
										"rev": 0,
										"timestamp": 0,
										"value": toOpaqueJson({ "name": "newId", "args": [42] }),
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
					newId: (attendee: Attendee, id: number) => {
						fail(`Unexpected newId event`);
					},
				}),
			);

			const { testEvents } = notificationsWorkspace.notifications;

			testEvents.events.on("unattendedNotification", (name, sender, ...content) => {
				assert.equal(name, "oldId");
				assert.equal(sender.attendeeId, attendeeId3);
				assert.deepEqual(content, [41]);
				assert(!unattendedEventCalled);
				unattendedEventCalled = true;
			});

			// Processing this signal should trigger the testEvents.newId event listeners
			processSignal(
				[],
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									[connectionId3]: { "rev": 0, "timestamp": 1000, "value": attendeeId3 },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									[attendeeId3]: {
										"rev": 0,
										"timestamp": 0,
										"value": toOpaqueJson({ "name": "oldId", "args": [41] }),
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

			function newIdEventHandler(attendee: Attendee, id: number): void {
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

			const { testEvents } = notificationsWorkspace.notifications;

			testEvents.events.on("unattendedNotification", (name, sender, ...content) => {
				assert.equal(name, "newId");
				assert.equal(sender.attendeeId, attendeeId3);
				assert.deepEqual(content, [43]);
				assert(!unattendedEventCalled);
				unattendedEventCalled = true;
			});

			testEvents.notifications.off("newId", newIdEventHandler);

			// Processing this signal should trigger the testEvents.newId event listeners
			processSignal(
				[],
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									[connectionId3]: { "rev": 0, "timestamp": 1000, "value": attendeeId3 },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									[attendeeId3]: {
										"rev": 0,
										"timestamp": 0,
										"value": toOpaqueJson({ "name": "newId", "args": [43] }),
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

			function originalEventHandler(attendee: Attendee, id: number): void {
				assert.equal(attendee.attendeeId, attendeeId3);
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

			const { testEvents } = notificationsWorkspace.notifications;

			testEvents.events.on("unattendedNotification", (name) => {
				fail(`Unexpected unattendedNotification: ${name}`);
			});

			const disconnect = testEvents.notifications.on(
				"newId",
				(_attendee: Attendee, _id: number) => {
					fail(`Unexpected event raised on disconnected listener`);
				},
			);
			// Remove the listener
			disconnect();

			// Act
			processSignal(
				[],
				{
					type: "Pres:DatastoreUpdate",
					content: {
						"sendTimestamp": 1020,
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									[connectionId3]: { "rev": 0, "timestamp": 1000, "value": attendeeId3 },
								},
							},
							"n:name:testNotificationWorkspace": {
								"testEvents": {
									[attendeeId3]: {
										"rev": 0,
										"timestamp": 0,
										"value": toOpaqueJson({ "name": "newId", "args": [44] }),
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

		it(".presence provides Presence it was created under", () => {
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

			assert.strictEqual(notificationsWorkspace.notifications.testEvents.presence, presence);
			assert.strictEqual(notificationsWorkspace.presence, presence);
		});
	});
});
