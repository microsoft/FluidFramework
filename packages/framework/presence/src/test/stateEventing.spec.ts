/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers } from "sinon";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import { assertFinalExpectations, prepareConnectedPresence } from "./testUtils.js";

import {
	Latest,
	LatestMap,
	type LatestMapValueManager,
	type LatestValueManager,
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
describe("State eventing", () => {
	let runtime: MockEphemeralRuntime;
	let logger: EventAndErrorTrackingLogger;
	let clock: SinonFakeTimers;
	let presence: ReturnType<typeof prepareConnectedPresence>;
	let latest: LatestValueManager<{ x: number; y: number; z: number }>;
	let latestMap: LatestMapValueManager<{ a: number; b: number } | { c: number; d: number }>;
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
		latest = states.props.latest;
		latestMap = states.props.latestMap;
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

	it("is consistent with attendee + latest value manager updates", () => {
		latest.events.on("updated", () => {
			assert(presence.getAttendee("client1") !== undefined);
		});
		presence.events.on("attendeeJoined", (attendee) => {
			assert.deepEqual(latest.clientValue(attendee).value, { x: 1, y: 1, z: 1 });
		});
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
		latestMap.events.on("updated", () => {
			assert(presence.getAttendee("client1") !== undefined);
		});
		presence.events.on("attendeeJoined", (attendee) => {
			assert.deepEqual(latestMap.clientValue(attendee).get("key1")?.value, { a: 1, b: 1 });
			assert.deepEqual(latestMap.clientValue(attendee).get("key2")?.value, { c: 1, d: 1 });
		});
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
});
