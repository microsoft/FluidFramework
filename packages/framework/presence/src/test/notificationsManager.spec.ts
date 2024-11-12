/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { useFakeTimers, type SinonFakeTimers, spy } from "sinon";

import { Notifications, type ISessionClient } from "../index.js";
import type { IPresence } from "../presence.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import { assertFinalExpectations, prepareConnectedPresence } from "./testUtils.js";

describe("Presence", () => {
	describe("NotificationsManager", () => {
		// Note: this test setup mimics the setup in src/test/presenceManager.spec.ts
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

			// We are configuring the runtime to be in a connected state, so ensure it looks connected
			runtime.connected = true;

			clock.setSystemTime(initialTime);

			// Set up the presence connection
			presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);
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

		it("Sends signal when custom notifications event is emitted", async () => {
			// Setup
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

			// Configure a notifications workspace
			const notificationsWorkspace = presence.getNotifications(
				"name:testNotificationWorkspace",
				{},
			);

			// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
			const notifications: typeof notificationsWorkspace = notificationsWorkspace;

			notifications.add(
				"testEvents",
				Notifications<
					// Below explicit generic specifiction should not be required.
					{
						newId: (id: number) => void;
					},
					"testEvents"
				>({
					newId: (client: ISessionClient, id: number) => {
						console.log(`Default testEvents listener: ${client.sessionId}: ${id}`);
					},
				}),
			);

			const { testEvents } = notifications.props;

			clock.tick(10);
			// This will trigger the second signal
			testEvents.emit.broadcast("newId", 42);

			assertFinalExpectations(runtime, logger);
		});

		it("Fires event when signal is received", async () => {
			// Configure a notifications workspace
			const notificationsWorkspace = presence.getNotifications(
				"name:testNotificationWorkspace",
				{},
			);

			// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
			const notifications: typeof notificationsWorkspace = notificationsWorkspace;

			notifications.add(
				"testEvents",
				Notifications<
					// Below explicit generic specifiction should not be required.
					{
						newId: (id: number) => void;
					},
					"testEvents"
				>({
					newId: (client: ISessionClient, id: number) => {
						console.debug(
							`Default testEvents listener: ${client.sessionId} has a new id: ${id}`,
						);
					},
				}),
			);

			const { testEvents } = notifications.props;

			const eventHandlerFunction = (client: ISessionClient, id: number): void => {
				console.debug(
					`Secondary testEvents listener: client=${JSON.stringify(client, undefined, 2)}, id=${id}`,
				);

				assert(client.sessionId !== undefined);
				assert(id !== undefined);
			};
			const eventHandler = spy(eventHandlerFunction);

			const eventHandlerFunction2 = (client: ISessionClient, id: number): void => {
				console.debug(
					`Tertiary testEvents listener: client=${JSON.stringify(client, undefined, 2)}, id=${id}`,
				);
			};
			const eventHandler2 = spy(eventHandlerFunction2);

			const disconnectFunctions = [
				testEvents.notifications.on("newId", eventHandler),
				testEvents.notifications.on("newId", eventHandler2),
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
					clientId: "client3",
				},
				false,
			);

			for (const disconnect of disconnectFunctions) {
				disconnect();
			}
			assert(eventHandler.callCount === 1);
			assert(eventHandler2.callCount === 1);
		});
	});
});

// ---- test (example) code ----

/**
 * Check that the code compiles.
 */
export function checkCompiles(): void {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const presence = {} as IPresence;
	const notificationsWorkspace = presence.getNotifications("name:testNotificationWorkspace", {
		chat: Notifications<{
			msg: (message: string) => void;
		}>({
			msg: (client: ISessionClient, message: string) => {
				console.log(`${client.sessionId} says, "${message}"`);
			},
		}),
	});
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const notifications: typeof notificationsWorkspace = notificationsWorkspace;

	// TODO: inferences for Notifications additions are not working.
	// They allow incorrect listener signatures and no named events
	// produced after `add`.
	// const NF = Notifications({
	// 	newId: (client: ISessionClient, id: number): void => {
	// 		console.log(`${client.sessionId} has a new id: ${id}`);
	// 	},
	// });

	notifications.add(
		"testEvents", // NF);
		// Below explicit generic specifaction should not be required.
		Notifications<
			{
				newId: (id: number) => void;
			},
			"testEvents"
		>({
			newId: (client: ISessionClient, id: number) => {
				console.log(`${client.sessionId} has a new id: ${id}`);
			},
		}),
	);

	// "newId" should be allowed as a named event.
	notifications.props.testEvents.emit.broadcast("newId", 42);

	const { chat } = notifications.props;

	chat.emit.broadcast("msg", "howdy");

	// Track clients that have started chatting
	const chatClients = new Set<ISessionClient>();
	const chatMsgOff = chat.notifications.on("msg", (client, _message) => {
		if (!chatClients.has(client)) {
			console.log(`client ${client.sessionId} has started chatting`);
			chatClients.add(client);
		}
	});
	chatMsgOff();

	function logUnattended(name: string, client: ISessionClient, ...content: unknown[]): void {
		console.log(
			`${client.sessionId} sent unattended notification '${name}' with content`,
			...content,
		);
	}

	const unattendedOff = chat.events.on("unattendedNotification", logUnattended);
	unattendedOff();
}
