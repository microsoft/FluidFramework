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
const latestUpdateRev2 = {
	"latest": {
		"sessionId-1": {
			"rev": 2,
			"timestamp": 50,
			"value": { x: 2, y: 2, z: 2 },
		},
	},
};

const itemRemovedMapUpdate = {
	"latestMap": {
		"sessionId-1": {
			"rev": 2,
			"items": {
				"key2": {
					"rev": 2,
					"timestamp": 50,
				},
			},
		},
	},
};

// Test case where a removed map item is updated with a latest update
const latestMapItemRemovedAndLatestUpdate = {
	latestUpdateRev2,
	itemRemovedMapUpdate,
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

		function verifyFinalState(
			attendee: ISessionClient,
			permutation: string[],
			itemRemovedWithLatestUpdate: boolean = false,
		): void {
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
				if (itemRemovedWithLatestUpdate) {
					assert.deepEqual(
						latestValue,
						{ x: 2, y: 2, z: 2 },
						"Eventing does not reflect latest value",
					);
				} else {
					assert.deepEqual(
						latestValue,
						{ x: 1, y: 1, z: 1 },
						"Eventing does not reflect latest value",
					);
				}
			}

			if (permutation.includes("latestMap")) {
				const latestMapValue = latestMap.clientValue(attendee);
				if (itemRemovedWithLatestUpdate) {
					assert.deepEqual(
						latestMapValue.get("key1")?.value,
						{ a: 1, b: 1 },
						"Eventing does not reflect latest map value",
					);
					assert.strictEqual(
						latestMapValue.get("key2"),
						undefined,
						"Eventing does not reflect latest map value",
					);
				} else {
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
			| typeof latestMapItemRemovedAndLatestUpdate
			| (typeof latestUpdate & typeof latestMapUpdate)
			| typeof latestUpdateRev2
			| typeof itemRemovedMapUpdate
			| typeof notificationsUpdate;

		function presenceSetup(sharedStatesWorkspace: boolean = true): void {
			if (sharedStatesWorkspace) {
				const states = presence.getStates("name:testWorkspace", {
					latest: Latest({ x: 0, y: 0, z: 0 }),
					latestMap: LatestMap({ key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } }),
				});
				latest = states.props.latest;
				latestMap = states.props.latestMap;
			} else {
				const latestsStates = presence.getStates("name:testWorkspace1", {
					latest: Latest({ x: 0, y: 0, z: 0 }),
				});
				const latesetMapStates = presence.getStates("name:testWorkspace2", {
					latestMap: LatestMap({ key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } }),
				});
				latest = latestsStates.props.latest;
				latestMap = latesetMapStates.props.latestMap;
			}
			const notificationsWorkspace = presence.getNotifications("name:testWorkspace", {
				notifications: Notifications<{ newId: (id: number) => void }>({
					newId: (_client: ISessionClient, _id: number) => {},
				}),
			});
			notificationManager = notificationsWorkspace.props.notifications;
		}
		function getSpies(
			valueManagers: string[],
			itemRemovedWithLatestUpdate: boolean = false,
		): SinonSpy[] {
			const spies: SinonSpy[] = [];
			for (const valueManager of valueManagers) {
				switch (valueManager) {
					case "latest": {
						const updatedEventSpy = spy(() => {
							getAttendeeAndVerifyFinalState(valueManagers, itemRemovedWithLatestUpdate);
						}).named("latestUpdated");
						spies.push(updatedEventSpy);
						latest.events.on("updated", updatedEventSpy);
						break;
					}
					case "latestMap": {
						const updatedEventSpy = spy(() => {
							getAttendeeAndVerifyFinalState(valueManagers, itemRemovedWithLatestUpdate);
						}).named("latestMapUpdated");
						latestMap.events.on("updated", updatedEventSpy);
						spies.push(updatedEventSpy);
						const itemUpdatedEventSpy = spy(() => {
							getAttendeeAndVerifyFinalState(valueManagers, itemRemovedWithLatestUpdate);
						}).named("latestMapItemUpdated");
						latestMap.events.on("itemUpdated", itemUpdatedEventSpy);

						const itemRemovedEventSpy = spy(() => {
							getAttendeeAndVerifyFinalState(valueManagers, itemRemovedWithLatestUpdate);
						}).named("latestMapItemRemoved");
						latestMap.events.on("itemRemoved", itemRemovedEventSpy);
						spies.push(
							itemRemovedWithLatestUpdate ? itemRemovedEventSpy : itemUpdatedEventSpy,
						);
						break;
					}
					case "notifications": {
						const notificationsEventSpy = spy(() => {
							getAttendeeAndVerifyFinalState(valueManagers, itemRemovedWithLatestUpdate);
						});
						spies.push(notificationsEventSpy);
						notificationManager.notifications.on("newId", notificationsEventSpy);
					}
					default: {
						break;
					}
				}
			}
			if (!itemRemovedWithLatestUpdate) {
				const attendeeSpy = spy((attendee: ISessionClient) => {
					verifyFinalState(attendee, valueManagers, itemRemovedWithLatestUpdate);
				});
				spies.push(attendeeSpy);
				presence.events.on("attendeeJoined", attendeeSpy);
			}
			return spies;
		}

		function getAttendeeAndVerifyFinalState(
			valueManagers: string[],
			itemRemovedWithLatestUpdate: boolean = false,
		): void {
			const attendee = presence.getAttendee("client1");
			verifyFinalState(attendee, valueManagers, itemRemovedWithLatestUpdate);
		}

		function processUpdates(
			valueManagerUpdates: Record<string, UpdateContent>,
			itemRemovedWithLatestUpdate: boolean = false,
		): SinonSpy[] {
			const valueManagersUpdated = [];
			for (const update of Object.values(valueManagerUpdates)) {
				for (const valueManager of Object.keys(update)) {
					valueManagersUpdated.push(valueManager);
				}
			}
			const spies = getSpies(valueManagersUpdated, itemRemovedWithLatestUpdate);
			const updates = itemRemovedWithLatestUpdate
				? valueManagerUpdates
				: { "system:presence": attendeeUpdate, ...valueManagerUpdates };
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
				if (s.name === "latestMapItemUpdated") {
					assert(s.calledTwice, `${s} should fire exactly twice`);
				} else if (s.name === "latestMapItemRemoved") {
					assert(s.calledOnce, `${s} should fire exactly once`);
				} else {
					assert(s.calledOnce, `${s} should fire exactly once`);
				}
			}
		}

		it("latest update comes before latestMap update in single workspace", async () => {
			presenceSetup(true /* sharedStatesWorkspaces */);
			const workspace = { "s:name:testWorkspace": { ...latestUpdate, ...latestMapUpdate } };
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("latestMap update comes before latest update in single workspace", async () => {
			presenceSetup(true /* sharedStatesWorkspaces */);
			const workspace = { "s:name:testWorkspace": { ...latestMapUpdate, ...latestUpdate } };
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("latest update comes before latestMap update in multiple workspaces", async () => {
			presenceSetup(false /* sharedStatesWorkspaces */);
			const workspace = {
				"s:name:testWorkspace1": latestUpdate,
				"s:name:testWorkspace2": latestMapUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("latestMap update comes before latest update in multiple workspaces", async () => {
			presenceSetup(false /* sharedStatesWorkspaces */);
			const workspace = {
				"s:name:testWorkspace2": latestMapUpdate,
				"s:name:testWorkspace1": latestUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("item removed from latestMap and latest update in shared workspace", async () => {
			presenceSetup(true /* sharedStatesWorkspaces */);
			const workspace = { "s:name:testWorkspace": { ...latestMapUpdate, ...latestUpdate } };
			presence.processSignal(
				"",
				{
					type: datastoreUpdateType,
					content: {
						sendTimestamp: clock.now - 10,
						avgLatency: 20,
						data: { "system:presence": attendeeUpdate, ...workspace },
					},
					clientId: "client1",
				},
				false,
			);
			const itemRemovedUpdate = {
				"s:name:testWorkspace": { ...latestMapItemRemovedAndLatestUpdate },
			};
			const eventSpies = processUpdates(
				itemRemovedUpdate,
				true /* itemRemovedWithLatestUpdate */,
			);
			assertSpies(eventSpies);
		});
		it("item removed from latestMap and latest update in multiple workspaces", async () => {
			presenceSetup(false /* sharedStatesWorkspaces */);
			const workspace = {
				"s:name:testWorkspace2": latestMapUpdate,
				"s:name:testWorkspace1": latestUpdate,
			};
			presence.processSignal(
				"",
				{
					type: datastoreUpdateType,
					content: {
						sendTimestamp: clock.now - 10,
						avgLatency: 20,
						data: { "system:presence": attendeeUpdate, ...workspace },
					},
					clientId: "client1",
				},
				false,
			);
			const itemRemovedUpdate = {
				"s:name:testWorkspace1": latestUpdateRev2,
				"s:name:testWorkspace2": itemRemovedMapUpdate,
			};
			const eventSpies = processUpdates(
				itemRemovedUpdate,
				true /* itemRemovedWithLatestUpdate */,
			);
			assertSpies(eventSpies);
		});
		it("Notifications workspace comes before States workspace", async () => {
			presenceSetup(true /* sharedStatesWorkspaces */);
			const workspace = {
				"n:name:testWorkspace": notificationsUpdate,
				"s:name:testWorkspace": latestUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("States workspace comes before Notifications workspace", async () => {
			presenceSetup(true /* sharedStatesWorkspaces */);
			const workspace = {
				"s:name:testWorkspace": latestUpdate,
				"n:name:testWorkspace": notificationsUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
		it("Notifications workspace comes in the middle of States workspaces", async () => {
			presenceSetup(false /* sharedStatesWorkspaces */);
			const workspace = {
				"s:name:testWorkspace1": latestUpdate,
				"n:name:testWorkspace": notificationsUpdate,
				"s:name:testWorkspace2": latestMapUpdate,
			};
			const eventSpies = processUpdates(workspace);
			assertSpies(eventSpies);
		});
	});
});
