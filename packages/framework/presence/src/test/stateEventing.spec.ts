/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers } from "sinon";

import type { ISessionClient } from "../index.js";

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
	"notification": {
		"sessionId-1": {
			"rev": 0,
			"timestamp": 0,
			"value": {},
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
	it("is consistent with attendee + latest value manager updates", () => {
		// VERIFY - consistent state in update eventing
		latest.events.on("updated", () => {
			assert(presence.getAttendee("client1") !== undefined);
		});
		presence.events.on("attendeeJoined", (attendee) => {
			assert.deepEqual(latest.clientValue(attendee).value, { x: 1, y: 1, z: 1 });
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
	});

	it("is consistent with attendee + latest map value manager updates", () => {
		// VERIFY - consistent state in update eventing
		latestMap.events.on("updated", () => {
			assert(presence.getAttendee("client1") !== undefined);
		});
		presence.events.on("attendeeJoined", (attendee) => {
			assert.deepEqual(latestMap.clientValue(attendee).get("key1")?.value, { a: 1, b: 1 });
			assert.deepEqual(latestMap.clientValue(attendee).get("key2")?.value, { c: 1, d: 1 });
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
	});

	it("is consistent with attendee + latest value manager + latest map value manager updates", () => {
		// VERIFY - consistent state in update eventing
		latest.events.on("updated", () => {
			assert(presence.getAttendee("client1") !== undefined);
			const attendee = presence.getAttendee("client1");
			assert.deepEqual(latest.clientValue(attendee).value, { x: 1, y: 1, z: 1 });
		});
		latestMap.events.on("updated", () => {
			assert(presence.getAttendee("client1") !== undefined);
			const attendee = presence.getAttendee("client1");
			assert.deepEqual(latestMap.clientValue(attendee).get("key1")?.value, { a: 1, b: 1 });
			assert.deepEqual(latestMap.clientValue(attendee).get("key2")?.value, { c: 1, d: 1 });
		});
		presence.events.on("attendeeJoined", (attendee) => {
			assert.deepEqual(latest.clientValue(attendee).value, { x: 1, y: 1, z: 1 });
			assert.deepEqual(latestMap.clientValue(attendee).get("key1")?.value, { a: 1, b: 1 });
			assert.deepEqual(latestMap.clientValue(attendee).get("key2")?.value, { c: 1, d: 1 });
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
	});

	it("is consistent with attendee + latest value manager + latest map value manager + notifications updates", () => {
		// VERIFY - consistent state in update eventing
		latest.events.on("updated", () => {
			assert(presence.getAttendee("client1") !== undefined);
			const attendee = presence.getAttendee("client1");
			assert.deepEqual(latest.clientValue(attendee).value, { x: 1, y: 1, z: 1 });
		});
		latestMap.events.on("updated", () => {
			assert(presence.getAttendee("client1") !== undefined);
			const attendee = presence.getAttendee("client1");
			assert.deepEqual(latestMap.clientValue(attendee).get("key1")?.value, { a: 1, b: 1 });
			assert.deepEqual(latestMap.clientValue(attendee).get("key2")?.value, { c: 1, d: 1 });
		});
		presence.events.on("attendeeJoined", (attendee) => {
			assert.deepEqual(latest.clientValue(attendee).value, { x: 1, y: 1, z: 1 });
			assert.deepEqual(latestMap.clientValue(attendee).get("key1")?.value, { a: 1, b: 1 });
			assert.deepEqual(latestMap.clientValue(attendee).get("key2")?.value, { c: 1, d: 1 });
		});
		notificationManager.notifications.on("newId", (client, id) => {
			assert(presence.getAttendee("client1") !== undefined);
			assert.deepEqual(latest.clientValue(client).value, { x: 1, y: 1, z: 1 });
			assert.deepEqual(latestMap.clientValue(client).get("key1")?.value, { a: 1, b: 1 });
			assert.deepEqual(latestMap.clientValue(client).get("key2")?.value, { c: 1, d: 1 });
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
						"n:name:testWorkspace": notificationsUpdate,
					},
				},
				clientId: "client1",
			},
			false,
		);
	});
});
