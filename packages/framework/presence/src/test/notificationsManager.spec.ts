/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISessionClient } from "../index.js";
import { Notifications } from "../index.js";
import type { IPresence } from "../presence.js";

describe("NotificationsManager", () => {
	/**
	 * See {@link checkCompiles} below
	 */
	it("API use compiles", () => {});
});

// ---- test (example) code ----

/**
 * Check that the code compiles.
 */
export function checkCompiles(): void {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const presence = {} as IPresence;
	const statesWorkspace = presence.getNotifications("name:testNotificationWorkspace", {
		notifications: Notifications<
			{
				msg: (message: string) => void;
			},
			string
		>({
			msg: (client: ISessionClient, message: string) => {
				console.log(`${client.currentClientId()} says, "${message}"`);
			},
		}),
	});
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const map: typeof statesWorkspace = statesWorkspace;

	// TODO: inferences for Notifications additions are not working.
	// They allow incorrect listener signatures and no named events
	// produced after `add`.
	const NF = Notifications({
		newId: (client: ISessionClient, id: number): void => {
			console.log(`${client.currentClientId()} has a new id: ${id}`);
		},
	});

	map.add("my_events", NF);
	// Below explicit generic specifaction should not be required.
	// 	Notifications<
	// 		{
	// 			newId: (id: number) => void;
	// 		},
	// 		"events"
	// 	>({
	// 		newId: (client: ISessionClient, id: number) => {
	// 			console.log(`${client.currentClientId()} has a new id: ${id}`);
	// 		},
	// 	}),
	// );

	// "newId" should be allowed as a named event.
	// map.my_events.emit.broadcast("newId", 42);

	function logUnattended(name: string, client: ISessionClient, ...content: unknown[]): void {
		console.log(
			`${client.currentClientId()} sent unattended notification '${name}' with content`,
			...content,
		);
	}

	const notifications = map.notifications;

	notifications.emit.broadcast("msg", "howdy");

	const unattendedOff = notifications.events.on("unattendedNotification", logUnattended);
	unattendedOff();
}
