/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers, SinonSpy } from "sinon";
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
} as const;
const latestUpdate = {
	"latest": {
		"sessionId-1": {
			"rev": 1,
			"timestamp": 0,
			"value": { x: 1, y: 1, z: 1 },
		},
	},
} as const;
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
} as const;
const notificationsUpdate = {
	"notifications": {
		"sessionId-1": {
			"rev": 0,
			"timestamp": 0,
			"value": { "name": "newId", "args": [42] },
			"ignoreUnmonitored": true,
		},
	},
};
describe("Presence", () => {
	describe("events are fired with consistent and final state when", () => {
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
			| typeof latestUpdate
			| typeof latestMapUpdate
			| (typeof latestUpdate & typeof latestMapUpdate)
			| typeof notificationsUpdate;

		function presenceSetup(multipleStatesWorkspaces: boolean = false): void {
			if (multipleStatesWorkspaces) {
				const latestsStates = presence.getStates("name:testWorkspace1", {
					latest: Latest({ x: 0, y: 0, z: 0 }),
				});
				const latesetMapStates = presence.getStates("name:testWorkspace2", {
					latestMap: LatestMap({ key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } }),
				});
				latest = latestsStates.props.latest;
				latestMap = latesetMapStates.props.latestMap;
			} else {
				const states = presence.getStates("name:testWorkspace", {
					latest: Latest({ x: 0, y: 0, z: 0 }),
					latestMap: LatestMap({ key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } }),
				});
				latest = states.props.latest;
				latestMap = states.props.latestMap;
			}
			const notificationsWorkspace = presence.getNotifications("name:testWorkspace", {
				notifications: Notifications<{ newId: (id: number) => void }>({
					newId: (_client: ISessionClient, _id: number) => {},
				}),
			});
			notificationManager = notificationsWorkspace.props.notifications;
		}
		function getSpies(valueManagers: string[]): SinonSpy[] {
			const spies: SinonSpy[] = [];
			for (const valueManager of valueManagers) {
				let eventSpy: SinonSpy;
				switch (valueManager) {
					case "latest": {
						eventSpy = spy(() => {
							const attendee = presence.getAttendee("client1");
							verifyFinalState(attendee, valueManagers);
						});
						spies.push(eventSpy);
						latest.events.on("updated", eventSpy);
						break;
					}
					case "latestMap": {
						eventSpy = spy(() => {
							const attendee = presence.getAttendee("client1");
							verifyFinalState(attendee, valueManagers);
						});

						spies.push(eventSpy);
						latestMap.events.on("updated", eventSpy);
						break;
					}
					case "notifications": {
						eventSpy = spy(() => {
							const attendee = presence.getAttendee("client1");
							verifyFinalState(attendee, valueManagers);
						});
						spies.push(eventSpy);
						notificationManager.notifications.on("newId", eventSpy);
					}
					default: {
						break;
					}
				}
			}
			const attendeeSpy = spy((attendee: ISessionClient) => {
				verifyFinalState(attendee, valueManagers);
			});
			spies.push(attendeeSpy);
			presence.events.on("attendeeJoined", attendeeSpy);
			return spies;
		}
		function processUpdates(valueManagerUpdates: Record<string, UpdateContent>): SinonSpy[] {
			const valueManagersUpdated = [];
			for (const update of Object.values(valueManagerUpdates)) {
				for (const valueManager of Object.keys(update)) {
					valueManagersUpdated.push(valueManager);
				}
			}
			const spies = getSpies(valueManagersUpdated);
			const updates = { "system:presence": attendeeUpdate, ...valueManagerUpdates };
			presence.processSignal(
				"",
				{
					type: datastoreUpdateType,
					content: {
						sendTimestamp: clock.now - 10,
						avgLatency: 20,
						data: updates,
					},
					clientId: "client1",
				},
				false,
			);
			return spies;
		}

		function assertSpies(spies: SinonSpy[]): void {
			for (const s of spies) {
				assert(s.calledOnce, `${s} should fire exactly once`);
			}
		}

		it("latest update comes before latestMap update in single workspace", async () => {
			presenceSetup(false);
			const workspace = { "s:name:testWorkspace": { ...latestUpdate, ...latestMapUpdate } };
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("latestMap update comes before latest update in single workspace", async () => {
			presenceSetup(false);
			const workspace = { "s:name:testWorkspace": { ...latestMapUpdate, ...latestUpdate } };
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("latest update comes before latestMap update in multiple workspaces", async () => {
			presenceSetup(true);
			const workspace = {
				"s:name:testWorkspace1": latestUpdate,
				"s:name:testWorkspace2": latestMapUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("latestMap update comes before latest update in multiple workspaces", async () => {
			presenceSetup(true);
			const workspace = {
				"s:name:testWorkspace2": latestMapUpdate,
				"s:name:testWorkspace1": latestUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("Notifications workspace comes before States workspace", async () => {
			presenceSetup(false);
			const workspace = {
				"n:name:testWorkspace": notificationsUpdate,
				"s:name:testWorkspace": latestUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("States workspace comes before Notifications workspace", async () => {
			presenceSetup(false);
			const workspace = {
				"s:name:testWorkspace": latestUpdate,
				"n:name:testWorkspace": notificationsUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
	});
});
