/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers, spy } from "sinon";

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

	function verifyFinalState(attendee: ISessionClient, permutation: string[]): void {
		// Verify attendee state (always check since system:presence is always included)
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

		// Only verify states that are included in the permutation
		if (permutation.includes("latest")) {
			const latestValue = latest.clientValue(attendee).value;
			assert.deepEqual(
				latestValue,
				{ x: 1, y: 1, z: 1 },
				"Eventing does not reflect latest value",
			);
		}

		if (permutation.includes("latestMap")) {
			const latestMapValue = latestMap.clientValue(attendee);
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
		}
	}

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
			testEvents: Notifications<{ newId: (id: number) => void }>({
				newId: (_client: ISessionClient, _id: number) => {},
			}),
		});
		latest = states.props.latest;
		latestMap = states.props.latestMap;
		notificationManager = notifications.props.testEvents;
	});

	afterEach(function (done: Mocha.Done) {
		clock.reset();
		if (this.currentTest?.state === "passed") {
			assertFinalExpectations(runtime, logger);
		}
		done();
	});

	after(() => {
		clock.restore();
	});

	type UpdateContent =
		| typeof attendeeUpdate
		| (typeof latestUpdate & typeof latestMapUpdate)
		| typeof notificationsUpdate;

	const createUpdatePermutation = (order: string[]): Record<string, UpdateContent> => {
		const updates: Record<string, UpdateContent> = {
			"system:presence": attendeeUpdate,
		};

		for (const key of order) {
			switch (key) {
				case "latest": {
					const existingUpdates = updates["s:name:testWorkspace"] ?? {};
					updates["s:name:testWorkspace"] = {
						...existingUpdates,
						...latestUpdate,
					};
					break;
				}
				case "latestMap": {
					const existingUpdates = updates["s:name:testWorkspace"] ?? {};
					updates["s:name:testWorkspace"] = {
						...existingUpdates,
						...latestMapUpdate,
					};
					break;
				}
				case "notifications": {
					updates["n:name:testWorkspace"] = notificationsUpdate;
					break;
				}
				default: {
					break;
				}
			}
		}

		return updates;
	};

	function testPermutation(permutation: string[]): void {
		it(`handles update order: ${permutation.join(" -> ")}`, async () => {
			const latestSpy = spy(() => {
				const attendee = presence.getAttendee("client1");
				verifyFinalState(attendee, permutation);
			});

			const latestMapSpy = spy(() => {
				const attendee = presence.getAttendee("client1");
				verifyFinalState(attendee, permutation);
			});

			const notificationsSpy = spy(() => {
				const attendee = presence.getAttendee("client1");
				verifyFinalState(attendee, permutation);
			});

			const attendeeSpy = spy((attendee: ISessionClient) => {
				verifyFinalState(attendee, permutation);
			});

			latest.events.on("updated", latestSpy);
			latestMap.events.on("updated", latestMapSpy);
			notificationManager.notifications.on("newId", notificationsSpy);
			presence.events.on("attendeeJoined", attendeeSpy);

			presence.processSignal(
				"",
				{
					type: datastoreUpdateType,
					content: {
						sendTimestamp: clock.now - 10,
						avgLatency: 20,
						data: createUpdatePermutation(permutation),
					},
					clientId: "client1",
				},
				false,
			);

			// Verify each spy was called exactly once
			assert(attendeeSpy.calledOnce, "attendeeJoined event should fire exactly once");
			if (permutation.includes("latest")) {
				assert(latestSpy.calledOnce, "latest update event should fire exactly once");
			}
			if (permutation.includes("latestMap")) {
				assert(latestMapSpy.calledOnce, "latestMap update event should fire exactly once");
			}
			if (permutation.includes("notifications")) {
				assert(notificationsSpy.calledOnce, "notifications event should fire exactly once");
			}
		});
	}

	// Test all possible permutations
	testPermutation(["latest", "latestMap"]);
	testPermutation(["latestMap", "latest"]);
	testPermutation(["latest", "notifications"]);
	testPermutation(["notifications", "latest"]);
	testPermutation(["latestMap", "notifications"]);
	testPermutation(["notifications", "latestMap"]);
	testPermutation(["latest", "latestMap", "notifications"]);
	testPermutation(["latest", "notifications", "latestMap"]);
	testPermutation(["latestMap", "latest", "notifications"]);
	testPermutation(["latestMap", "notifications", "latest"]);
	testPermutation(["notifications", "latest", "latestMap"]);
	testPermutation(["notifications", "latestMap", "latest"]);
});
