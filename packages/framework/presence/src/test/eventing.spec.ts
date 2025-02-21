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

/**
 * Workspace updates
 */
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
} as const;
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
} as const;
const itemRemovedAndItemUpdatedMapUpdate = {
	"latestMap": {
		"sessionId-1": {
			"rev": 2,
			"items": {
				"key1": {
					"rev": 2,
					"timestamp": 50,
					"value": { a: 2, b: 2 },
				},
				"key2": {
					"rev": 2,
					"timestamp": 50,
				},
			},
		},
	},
};
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

		interface LatestMapValueExpected {
			key1: { a: number; b: number } | undefined;
			key2: { c: number; d: number } | undefined;
		}
		interface LatestValueExpected {
			x: number;
			y: number;
			z: number;
		}
		type StateVerification =
			| {
					manager: "latest";
					expectedValue: LatestValueExpected;
			  }
			| {
					manager: "latestMap";
					expectedValue: LatestMapValueExpected;
			  };

		function verifyFinalState(
			attendee: ISessionClient,
			verifications: StateVerification[],
		): void {
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

			for (const { manager, expectedValue } of verifications) {
				switch (manager) {
					case "latest": {
						assert.deepEqual(
							latest.clientValue(attendee).value,
							expectedValue,
							"Eventing does not reflect latest value",
						);
						break;
					}
					case "latestMap": {
						assert.deepEqual(
							latestMap.clientValue(attendee).get("key1")?.value,
							expectedValue.key1,
							"Eventing does not reflect latest map value",
						);
						assert.deepEqual(
							latestMap.clientValue(attendee).get("key2")?.value,
							expectedValue.key2,
							"Eventing does not reflect latest map value",
						);
						break;
					}
					default: {
						break;
					}
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
			| typeof itemRemovedAndItemUpdatedMapUpdate
			| typeof notificationsUpdate;

		function setupSharedStatesWorkspace(notifications: boolean = false): void {
			let states;
			if (notifications) {
				states = presence.getStates("name:testWorkspace", {
					latest: Latest({ x: 0, y: 0, z: 0 }),
					notifications: Notifications<{ newId: (id: number) => void }>({
						newId: (_client: ISessionClient, _id: number) => {},
					}),
					latestMap: LatestMap({ key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } }),
				});
				notificationManager = states.props.notifications;
			} else {
				states = presence.getStates("name:testWorkspace", {
					latest: Latest({ x: 0, y: 0, z: 0 }),
					latestMap: LatestMap({ key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } }),
				});
			}
			latest = states.props.latest;
			latestMap = states.props.latestMap;
		}

		function setupMultipleStatesWorkspaces(): void {
			const latestsStates = presence.getStates("name:testWorkspace1", {
				latest: Latest({ x: 0, y: 0, z: 0 }),
			});
			const latesetMapStates = presence.getStates("name:testWorkspace2", {
				latestMap: LatestMap({ key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } }),
			});
			latest = latestsStates.props.latest;
			latestMap = latesetMapStates.props.latestMap;
		}

		function setupNotificationsWorkspace(): void {
			const notificationsWorkspace = presence.getNotifications("name:testWorkspace", {
				notifications: Notifications<{ newId: (id: number) => void }>({
					newId: (_client: ISessionClient, _id: number) => {},
				}),
			});
			notificationManager = notificationsWorkspace.props.notifications;
		}

		function processUpdates(
			valueManagerUpdates: Record<string, UpdateContent>,
			systemWorkspaceUpdate: boolean = true,
		): void {
			const updates = systemWorkspaceUpdate
				? { "system:presence": attendeeUpdate, ...valueManagerUpdates }
				: valueManagerUpdates;
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
		}

		function getTestAttendee(): ISessionClient {
			return presence.getAttendee("sessionId-1");
		}

		describe("states workspace", () => {
			let latestUpdatedEventSpy: SinonSpy;
			let latestMapUpdatedEventSpy: SinonSpy;
			let itemUpdatedEventSpy: SinonSpy;

			describe("value is updated where", () => {
				let atteendeeEventSpy: SinonSpy;

				function verify(): void {
					verifyFinalState(getTestAttendee(), [
						{ manager: "latest", expectedValue: { x: 1, y: 1, z: 1 } },
						{
							manager: "latestMap",
							expectedValue: { key1: { a: 1, b: 1 }, key2: { c: 1, d: 1 } },
						},
					]);
				}

				function assertSpies(): void {
					assert.ok(atteendeeEventSpy.calledOnce, "attendee event not fired exactly once");
					assert.ok(
						latestUpdatedEventSpy.calledOnce,
						"latest update event not fired exactly once",
					);
					assert.ok(
						latestMapUpdatedEventSpy.calledOnce,
						"latestMap update event not fired exactly once",
					);
					assert.ok(
						itemUpdatedEventSpy.calledTwice,
						"latestMap item update event not fired exactly twice",
					);
				}

				function setupListeners(): void {
					latest.events.on("updated", latestUpdatedEventSpy);
					latestMap.events.on("updated", latestMapUpdatedEventSpy);
					latestMap.events.on("itemUpdated", itemUpdatedEventSpy);
					presence.events.on("attendeeJoined", atteendeeEventSpy);
				}

				beforeEach(() => {
					latestUpdatedEventSpy = spy(verify);
					latestMapUpdatedEventSpy = spy(verify);
					itemUpdatedEventSpy = spy(verify);
					atteendeeEventSpy = spy(verify);
				});

				it("'latest' update comes before 'latestMap' update in single workspace", async () => {
					// Setup
					setupSharedStatesWorkspace();
					setupListeners();
					const workspace = {
						"s:name:testWorkspace": { ...latestUpdate, ...latestMapUpdate },
					};
					// Act
					processUpdates(workspace);
					// Verify
					assertSpies();
				});

				it("'latestMap' update comes before 'latest' update in single workspace", async () => {
					// Setup
					setupSharedStatesWorkspace();
					setupListeners();
					const workspace = {
						"s:name:testWorkspace": { ...latestMapUpdate, ...latestUpdate },
					};
					// Act
					processUpdates(workspace);
					// Verify
					assertSpies();
				});

				it("workspace 1 update comes before workspace 2 update in multiple workspaces", async () => {
					// Setup
					setupMultipleStatesWorkspaces();
					setupListeners();
					const workspace = {
						"s:name:testWorkspace1": latestUpdate,
						"s:name:testWorkspace2": latestMapUpdate,
					};
					// Act
					processUpdates(workspace);
					// Verify
					assertSpies();
				});

				it("workspace 2 update comes before workspace 1 update in multiple workspaces", async () => {
					// Setup
					setupMultipleStatesWorkspaces();
					setupListeners();
					const workspace = {
						"s:name:testWorkspace2": latestMapUpdate,
						"s:name:testWorkspace1": latestUpdate,
					};
					// Act
					processUpdates(workspace);
					// Verify
					assertSpies();
				});
			});

			describe("map item is removed", () => {
				let itemRemovedEventSpy: SinonSpy;

				describe("and 'latest' value updated", () => {
					function verify(): void {
						verifyFinalState(getTestAttendee(), [
							{ manager: "latest", expectedValue: { x: 2, y: 2, z: 2 } },
							{
								manager: "latestMap",
								expectedValue: { key1: { a: 1, b: 1 }, key2: undefined },
							},
						]);
					}

					function setupSpiesAndListeners(): void {
						itemRemovedEventSpy = spy(verify);
						latestUpdatedEventSpy = spy(verify);
						latestMapUpdatedEventSpy = spy(verify);
						latest.events.on("updated", latestUpdatedEventSpy);
						latestMap.events.on("updated", latestMapUpdatedEventSpy);
						latestMap.events.on("itemRemoved", itemRemovedEventSpy);
					}

					function assertSpies(): void {
						assert.ok(
							latestUpdatedEventSpy.calledOnce,
							`latest update event not fired exactly once`,
						);
						assert.ok(
							latestMapUpdatedEventSpy.calledOnce,
							"latestMap update event not fired exactly once",
						);
						assert.ok(
							itemRemovedEventSpy.calledOnce,
							"latestMap item remove event not fired exactly once",
						);
					}

					it("in a single workspace", async () => {
						// Setup
						setupSharedStatesWorkspace();
						const workspace = {
							"s:name:testWorkspace": { ...latestMapUpdate, ...latestUpdate },
						};
						processUpdates(workspace);
						setupSpiesAndListeners();
						const itemRemovedUpdate = {
							"s:name:testWorkspace": { ...latestUpdateRev2, ...itemRemovedMapUpdate },
						};
						// Act
						processUpdates(itemRemovedUpdate, false /* systemWorkspaceUpdate */);
						// Verify
						assertSpies();
					});

					it("in multiple workspaces", async () => {
						// Setup
						setupMultipleStatesWorkspaces();
						const workspace = {
							"s:name:testWorkspace2": latestMapUpdate,
							"s:name:testWorkspace1": latestUpdate,
						};
						processUpdates(workspace);
						setupSpiesAndListeners();
						const itemRemovedUpdate = {
							"s:name:testWorkspace1": latestUpdateRev2,
							"s:name:testWorkspace2": itemRemovedMapUpdate,
						};
						// Act
						processUpdates(itemRemovedUpdate, false /* systemWorkspaceUpdate */);
						// Verify
						assertSpies();
					});
				});

				describe("and map item is updated", () => {
					function verify(): void {
						verifyFinalState(getTestAttendee(), [
							{
								manager: "latestMap",
								expectedValue: { key1: { a: 2, b: 2 }, key2: undefined },
							},
						]);
					}

					function setupSpiesAndListeners(): void {
						itemRemovedEventSpy = spy(verify);
						latestMapUpdatedEventSpy = spy(verify);
						itemUpdatedEventSpy = spy(verify);

						latestMap.events.on("updated", latestMapUpdatedEventSpy);
						latestMap.events.on("itemUpdated", itemUpdatedEventSpy);
						latestMap.events.on("itemRemoved", itemRemovedEventSpy);
					}

					function assertSpies(): void {
						assert.ok(
							itemUpdatedEventSpy.calledOnce,
							`latest update event not fired exactly once`,
						);
						assert.ok(
							latestMapUpdatedEventSpy.calledOnce,
							"latestMap update event not fired exactly once",
						);
						assert.ok(
							itemRemovedEventSpy.calledOnce,
							"latestMap item remove event not fired exactly once",
						);
					}

					it("in a single workspace", () => {
						// Setup
						setupSharedStatesWorkspace();
						const workspace = {
							"s:name:testWorkspace": latestMapUpdate,
						};
						processUpdates(workspace);
						setupSpiesAndListeners();
						const itemRemovedAndItemUpdatedUpdate = {
							"s:name:testWorkspace": itemRemovedAndItemUpdatedMapUpdate,
						};
						// Act
						processUpdates(itemRemovedAndItemUpdatedUpdate, false /* systemWorkspaceUpdate */);
						// Verify
						assertSpies();
					});
				});
			});
		});

		describe("Notifications update", () => {
			let notificationSpy: SinonSpy;
			let latestSpy: SinonSpy;
			let attendeeSpy: SinonSpy;
			let latestMapSpy: SinonSpy;

			function verify(): void {
				verifyFinalState(getTestAttendee(), [
					{ manager: "latest", expectedValue: { x: 1, y: 1, z: 1 } },
					{
						manager: "latestMap",
						expectedValue: { key1: { a: 1, b: 1 }, key2: { c: 1, d: 1 } },
					},
				]);
			}

			function setupListeners(): void {
				notificationManager.notifications.on("newId", notificationSpy);
				latest.events.on("updated", latestSpy);
				latestMap.events.on("updated", latestMapSpy);
				presence.events.on("attendeeJoined", attendeeSpy);
			}

			function assertSpies(): void {
				assert.ok(notificationSpy.calledOnce, "notification event not fired exactly once");
				assert.ok(latestSpy.calledOnce, "latest update event not fired exactly once");
				assert.ok(attendeeSpy.calledOnce, "attendee event not fired exactly once");
			}

			beforeEach(() => {
				notificationSpy = spy(() => verify());
				latestSpy = spy(() => verify());
				attendeeSpy = spy(() => verify());
				latestMapSpy = spy(() => verify());
			});

			it("comes before states workspace update", async () => {
				// Setup
				setupSharedStatesWorkspace();
				setupNotificationsWorkspace();
				setupListeners();
				const workspace = {
					"n:name:testWorkspace": notificationsUpdate,
					"s:name:testWorkspace": { ...latestUpdate, ...latestMapUpdate },
				};
				// Act
				processUpdates(workspace);
				// Verify
				assertSpies();
			});

			it("comes after states workspace update", async () => {
				// Setup
				setupSharedStatesWorkspace();
				setupNotificationsWorkspace();
				setupListeners();
				const workspace = {
					"s:name:testWorkspace": { ...latestUpdate, ...latestMapUpdate },
					"n:name:testWorkspace": notificationsUpdate,
				};
				// Act
				processUpdates(workspace);
				// Verify
				assertSpies();
			});

			it("comes in between states workspaces", async () => {
				// Setup
				setupMultipleStatesWorkspaces();
				setupNotificationsWorkspace();
				setupListeners();
				const workspace = {
					"s:name:testWorkspace1": latestUpdate,
					"n:name:testWorkspace": notificationsUpdate,
					"s:name:testWorkspace2": latestMapUpdate,
				};
				// Act
				processUpdates(workspace);
				// Verify
				assertSpies();
			});

			it("within a states workspace", async () => {
				// Setup
				setupSharedStatesWorkspace(true /* notifications */);
				setupListeners();
				const workspace = {
					"s:name:testWorkspace": {
						...latestUpdate,
						...notificationsUpdate,
						...latestMapUpdate,
					},
				};
				// Act
				processUpdates(workspace);
				// Verify
				assertSpies();
			});
		});
	});
});
