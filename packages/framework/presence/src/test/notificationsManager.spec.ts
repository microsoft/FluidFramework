/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { Notifications, type ISessionClient } from "../index.js";
import type { IPresence } from "../presence.js";
import { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import { assertFinalExpectations } from "./testUtils.js";

describe("Presence", () => {
	describe("NotificationsManager", () => {
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

		/**
		 * See {@link checkCompiles} below
		 */
		it("API use compiles", () => {});

		it("Sends event", async () => {
			const presence = createPresenceManager(runtime);
			const notificationsWorkspace = presence.getNotifications(
				"name:testNotificationWorkspace",
				{
					chat: Notifications<{
						msg: (message: string) => void;
					}>({
						msg: (client: ISessionClient, message: string) => {
							console.log(`${client.sessionId} says, "${message}"`);
						},
					}),
				},
			);

			// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
			const notifications: typeof notificationsWorkspace = notificationsWorkspace;

			notifications.add(
				"my_events",
				Notifications<
					// Below explicit generic specifiction should not be required.
					{
						newId: (id: number) => void;
					},
					"my_events"
				>({
					newId: (client: ISessionClient, id: number) => {
						console.log(`${client.sessionId} has a new id: ${id}`);
					},
				}),
			);

			const { chat, my_events } = notifications;
			my_events.notifications.on("newId", (client: ISessionClient, id: number) => {
				console.debug(`${client.sessionId} assigned a new ID: ${id}`);
			});

			// "newId" should be allowed as a named event.
			my_events.emit.broadcast("newId", 42);

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

			assert(2 === 2);
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
		"my_events", // NF);
		// Below explicit generic specifaction should not be required.
		Notifications<
			{
				newId: (id: number) => void;
			},
			"my_events"
		>({
			newId: (client: ISessionClient, id: number) => {
				console.log(`${client.sessionId} has a new id: ${id}`);
			},
		}),
	);

	// "newId" should be allowed as a named event.
	notifications.my_events.emit.broadcast("newId", 42);

	const { chat } = notifications;

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
