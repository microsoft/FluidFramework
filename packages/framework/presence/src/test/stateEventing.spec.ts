/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers } from "sinon";

import type { ISessionClient, LatestValueData } from "../index.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import { assertFinalExpectations, prepareConnectedPresence } from "./testUtils.js";

import {
	Latest,
	LatestMap,
	Notifications,
	type LatestMapValueManager,
	type LatestValueManager,
	type NotificationsManager,
} from "@fluidframework/presence/alpha";

const datastoreUpdateType = "Pres:DatastoreUpdate";
const attendeeUpdate = {
	"clientToSessionId": {
		"client1": {
			"rev": 0,
			"timestamp": 0,
			"value": "sessionId-1",
		},
	},
};
const latestUpdate = {
	"latest": {
		"sessionId-1": {
			"rev": 1,
			"timestamp": 0,
			"value": { x: 1, y: 1, z: 1 },
		},
	},
};
const latestMapUpdate = {
	"latestMap": {
		"sessionId-1": {
			"rev": 1,
			"items": {
				"key1": {
					"rev": 1,
					"timestamp": 0,
					"value": { a: 1, b: 1 },
				},
				"key2": {
					"rev": 1,
					"timestamp": 0,
					"value": { c: 1, d: 1 },
				},
			},
		},
	},
};
const notificationsUpdate = {
	"testEvents": {
		"sessionId-1": {
			"rev": 0,
			"timestamp": 0,
			"value": { "name": "newId", "args": [42] },
			"ignoreUnmonitored": true,
		},
	},
};

describe("ValueManager eventing", () => {
	let runtime: MockEphemeralRuntime;
	let logger: EventAndErrorTrackingLogger;
	let clock: SinonFakeTimers;
	let presence: ReturnType<typeof prepareConnectedPresence>;
	let latest: LatestValueManager<{ x: number; y: number; z: number }>;
	let latestMap: LatestMapValueManager<{ a: number; b: number } | { c: number; d: number }>;
	let notificationManager: NotificationsManager<{ newId: (id: number) => void }>;
	before(() => {
		clock = useFakeTimers();
	});
	beforeEach(() => {
		logger = new EventAndErrorTrackingLogger();
		runtime = new MockEphemeralRuntime(logger);
		presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);
		const states = presence.getStates("name:testWorkspace", {
			latest: Latest({ x: 0, y: 0, z: 0 }),
			latestMap: LatestMap({ key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } }),
		});
		const notifications = presence.getNotifications("name:testWorkspace", {
			testEvents: Notifications<// Below explicit generic specification should not be required.
			{
				newId: (id: number) => void;
			}>({
				newId: (_client: ISessionClient, _id: number) => {},
			}),
		});
		latest = states.props.latest;
		latestMap = states.props.latestMap;
		notificationManager = notifications.props.testEvents;
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
	 * Each of these tests will have multiple attendee/valuemanager updates in one datastore update message.
	 * The idea here is to make sure every event triggered by the datastore message has consistent state.
	 * This is done checking that every update within the message is reflected in every event, no matter the order.
	 */
	it("is consistent with attendee + latest value manager updates", async () => {
		// Setup - Create promises that resolve when each event fires.
		const latestPromise = new Promise<{
			latestValue: { x: number; y: number; z: number };
			attendee: ISessionClient;
		}>((resolve) => {
			latest.events.on("updated", (value) => {
				const newAttendee = presence.getAttendee("client1");
				resolve({ latestValue: value.value, attendee: newAttendee });
			});
		});
		const attendeePromise = new Promise<{
			latestValue: { x: number; y: number; z: number };
			attendee: ISessionClient;
		}>((resolve) => {
			presence.events.on("attendeeJoined", (newAttendee) => {
				const newLatestValue = latest.clientValue(newAttendee).value;
				resolve({ latestValue: newLatestValue, attendee: newAttendee });
			});
		});

		// ACT - Process datastore update signal message
		presence.processSignal(
			"",
			{
				type: datastoreUpdateType,
				content: {
					sendTimestamp: clock.now - 10,
					avgLatency: 20,
					data: {
						"system:presence": attendeeUpdate,
						"s:name:testWorkspace": latestUpdate,
					},
				},
				clientId: "client1",
			},
			false,
		);

		// Wait for whichever event fires first.
		const { latestValue, attendee } = await Promise.race([latestPromise, attendeePromise]);
		// Verify - Immediately verify consistency on the first event.
		assert.deepEqual(
			latestValue,
			{ x: 1, y: 1, z: 1 },
			"Eventing does not reflect latest value",
		);
		assert.ok(attendee, "Eventing does not reflect new attendee");
		assert.strictEqual(
			attendee.sessionId,
			"sessionId-1",
			"Eventing does not reflect new attendee's sessionId",
		);
		assert.strictEqual(
			attendee.getConnectionId(),
			"client1",
			"Eventing does not reflect new attendee's connection id",
		);
		// Wait for both events to eventually fire.
		await Promise.all([latestPromise, attendeePromise]);
	});

	it("is consistent with attendee + latest map value manager updates", async () => {
		// Setup - Create promises that resolve when each event fires.
		const latestMapPromise = new Promise<{
			latestMapValue: ReadonlyMap<
				string | number,
				LatestValueData<{ a: number; b: number } | { c: number; d: number }>
			>;
			attendee: ISessionClient;
		}>((resolve) => {
			latestMap.events.on("updated", (updatedMap) => {
				const newAttendee = presence.getAttendee("client1");
				resolve({ latestMapValue: updatedMap.items, attendee: newAttendee });
			});
		});
		const attendeePromise = new Promise<{
			latestMapValue: ReadonlyMap<
				string | number,
				LatestValueData<{ a: number; b: number } | { c: number; d: number }>
			>;
			attendee: ISessionClient;
		}>((resolve) => {
			presence.events.on("attendeeJoined", (newAttendee) => {
				const newLatestMapValue = latestMap.clientValue(newAttendee);
				resolve({ latestMapValue: newLatestMapValue, attendee: newAttendee });
			});
		});

		// ACT - Process datastore update signal message
		presence.processSignal(
			"",
			{
				type: datastoreUpdateType,
				content: {
					sendTimestamp: clock.now - 10,
					avgLatency: 20,
					data: {
						"system:presence": attendeeUpdate,
						"s:name:testWorkspace": latestMapUpdate,
					},
				},
				clientId: "client1",
			},
			false,
		);

		// Wait for whichever event fires first.
		const { latestMapValue, attendee } = await Promise.race([
			latestMapPromise,
			attendeePromise,
		]);
		// Verify - Immediately verify consistency on the first event.
		assert.deepEqual(
			latestMapValue.get("key1")?.value,
			{ a: 1, b: 1 },
			"Eventing does not reflect latest map value",
		);
		assert.deepEqual(
			latestMapValue.get("key2")?.value,
			{ c: 1, d: 1 },
			"Eventing does not reflect latest map value",
		);
		assert.ok(attendee, "Eventing does not reflect new attendee");
		assert.strictEqual(
			attendee.sessionId,
			"sessionId-1",
			"Eventing does not reflect new attendee's sessionId",
		);
		assert.strictEqual(
			attendee.getConnectionId(),
			"client1",
			"Eventing does not reflect new attendee's connection id",
		);
		// Wait for both events to eventually fire.
		await Promise.all([latestMapPromise, attendeePromise]);
	});

	it("is consistent with attendee + notifications manager updates", async () => {
		// Setup - Create promises that resolve when each event fires.
		const notificationPromise = new Promise<{
			attendee: ISessionClient;
		}>((resolve) => {
			notificationManager.notifications.on("newId", (newAttendee, newId) => {
				resolve({ attendee: newAttendee });
			});
		});
		const attendeePromise = new Promise<{
			attendee: ISessionClient;
		}>((resolve) => {
			presence.events.on("attendeeJoined", (newAttendee) => {
				resolve({ attendee: newAttendee });
			});
		});

		// ACT - Process datastore update signal message
		presence.processSignal(
			"",
			{
				type: datastoreUpdateType,
				content: {
					sendTimestamp: clock.now - 10,
					avgLatency: 20,
					data: {
						"system:presence": attendeeUpdate,
						"n:name:testWorkspace": notificationsUpdate,
					},
				},
				clientId: "client1",
			},
			false,
		);

		// Wait for whichever event fires first.
		const { attendee } = await Promise.race([notificationPromise, attendeePromise]);
		// Verify - Immediately verify consistency on the first event.
		assert.ok(attendee, "Eventing does not reflect new attendee");
		assert.strictEqual(
			attendee.sessionId,
			"sessionId-1",
			"Eventing does not reflect new attendee's sessionId",
		);
		assert.strictEqual(
			attendee.getConnectionId(),
			"client1",
			"Eventing does not reflect new attendee's connection id",
		);
		// Wait for both events to eventually fire.
		await Promise.all([notificationPromise, attendeePromise]);
	});

	it("is consistent with attendee + latest value manager + latest map value manager updates", async () => {
		// Setup - Create promises that resolve when each event fires.
		const latestMapPromise = new Promise<{
			latestValue: { x: number; y: number; z: number };
			latestMapValue: ReadonlyMap<
				string | number,
				LatestValueData<{ a: number; b: number } | { c: number; d: number }>
			>;
			attendee: ISessionClient;
		}>((resolve) => {
			latestMap.events.on("updated", (updatedMap) => {
				const newAttendee = presence.getAttendee("client1");
				const newLatestValue = latest.clientValue(newAttendee).value;
				resolve({
					latestValue: newLatestValue,
					latestMapValue: updatedMap.items,
					attendee: newAttendee,
				});
			});
		});
		const attendeePromise = new Promise<{
			latestValue: { x: number; y: number; z: number };
			latestMapValue: ReadonlyMap<
				string | number,
				LatestValueData<{ a: number; b: number } | { c: number; d: number }>
			>;
			attendee: ISessionClient;
		}>((resolve) => {
			presence.events.on("attendeeJoined", (newAttendee) => {
				const newLatestMapValue = latestMap.clientValue(newAttendee);
				const newLatestValue = latest.clientValue(newAttendee).value;
				resolve({
					latestValue: newLatestValue,
					latestMapValue: newLatestMapValue,
					attendee: newAttendee,
				});
			});
		});
		const latestPromise = new Promise<{
			latestValue: { x: number; y: number; z: number };
			latestMapValue: ReadonlyMap<
				string | number,
				LatestValueData<{ a: number; b: number } | { c: number; d: number }>
			>;
			attendee: ISessionClient;
		}>((resolve) => {
			latest.events.on("updated", (value) => {
				const newAttendee = presence.getAttendee("client1");
				const newLatestMapValue = latestMap.clientValue(newAttendee);
				resolve({
					latestValue: value.value,
					latestMapValue: newLatestMapValue,
					attendee: newAttendee,
				});
			});
		});

		// ACT - Process datastore update signal message
		presence.processSignal(
			"",
			{
				type: datastoreUpdateType,
				content: {
					sendTimestamp: clock.now - 10,
					avgLatency: 20,
					data: {
						"system:presence": attendeeUpdate,
						"s:name:testWorkspace": {
							...latestUpdate,
							...latestMapUpdate,
						},
					},
				},
				clientId: "client1",
			},
			false,
		);

		// Wait for whichever event fires first.
		const { latestValue, latestMapValue, attendee } = await Promise.race([
			latestPromise,
			latestMapPromise,
			attendeePromise,
		]);
		// Verify - Immediately verify consistency on the first event.
		assert.deepEqual(
			latestValue,
			{ x: 1, y: 1, z: 1 },
			"Eventing does not reflect latest value",
		);
		assert.deepEqual(
			latestMapValue.get("key1")?.value,
			{ a: 1, b: 1 },
			"Eventing does not reflect latest map value",
		);
		assert.deepEqual(
			latestMapValue.get("key2")?.value,
			{ c: 1, d: 1 },
			"Eventing does not reflect latest map value",
		);
		assert.ok(attendee, "Eventing does not reflect new attendee");
		assert.strictEqual(
			attendee.sessionId,
			"sessionId-1",
			"Eventing does not reflect new attendee's sessionId",
		);
		assert.strictEqual(
			attendee.getConnectionId(),
			"client1",
			"Eventing does not reflect new attendee's connection id",
		);
		// Wait for both events to eventually fire.
		await Promise.all([latestPromise, latestMapPromise, attendeePromise]);
	});
});
