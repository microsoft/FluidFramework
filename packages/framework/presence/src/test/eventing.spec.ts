/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers, SinonSpy } from "sinon";
import { useFakeTimers, spy } from "sinon";

import type { Attendee, WorkspaceAddress } from "../index.js";
import { toOpaqueJson } from "../internalUtils.js";
import type { GeneralDatastoreMessageContent, InternalWorkspaceAddress } from "../protocol.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	prepareConnectedPresence,
	attendeeId1,
} from "./testUtils.js";

import type {
	LatestRaw,
	LatestMapRaw,
	NotificationsManager,
} from "@fluidframework/presence/alpha";
import { Notifications, StateFactory } from "@fluidframework/presence/alpha";

const datastoreUpdateType = "Pres:DatastoreUpdate";

type StatesObjectUpdateContent = GeneralDatastoreMessageContent[InternalWorkspaceAddress];
/**
 * Workspace updates
 */
const attendeeUpdate = {
	"clientToSessionId": {
		"client1": {
			"rev": 0,
			"timestamp": 0,
			"value": attendeeId1,
		},
	},
} as const;
const latestUpdate = {
	"latest": {
		[attendeeId1]: {
			"rev": 1,
			"timestamp": 0,
			"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
		},
	},
} as const satisfies StatesObjectUpdateContent;
const latestMapUpdate = {
	"latestMap": {
		[attendeeId1]: {
			"rev": 1,
			"items": {
				"key1": {
					"rev": 1,
					"timestamp": 0,
					"value": toOpaqueJson({ a: 1, b: 1 }),
				},
				"key2": {
					"rev": 1,
					"timestamp": 0,
					"value": toOpaqueJson({ c: 1, d: 1 }),
				},
			},
		},
	},
} as const satisfies StatesObjectUpdateContent;
const latestUpdateRev2 = {
	"latest": {
		[attendeeId1]: {
			"rev": 2,
			"timestamp": 50,
			"value": toOpaqueJson({ x: 2, y: 2, z: 2 }),
		},
	},
} as const satisfies StatesObjectUpdateContent;
const itemRemovedMapUpdate = {
	"latestMap": {
		[attendeeId1]: {
			"rev": 2,
			"items": {
				"key2": {
					"rev": 2,
					"timestamp": 50,
				},
			},
		},
	},
} as const satisfies StatesObjectUpdateContent;
const itemRemovedAndItemUpdatedMapUpdate = {
	"latestMap": {
		[attendeeId1]: {
			"rev": 2,
			"items": {
				"key2": {
					"rev": 2,
					"timestamp": 50,
				},
				"key1": {
					"rev": 2,
					"timestamp": 50,
					"value": toOpaqueJson({ a: 2, b: 2 }),
				},
			},
		},
	},
} as const satisfies StatesObjectUpdateContent;
const itemUpdatedAndItemRemovedMapUpdate = {
	"latestMap": {
		[attendeeId1]: {
			"rev": 2,
			"items": {
				"key1": {
					"rev": 2,
					"timestamp": 50,
					"value": toOpaqueJson({ a: 2, b: 2 }),
				},
				"key2": {
					"rev": 2,
					"timestamp": 50,
				},
			},
		},
	},
} as const satisfies StatesObjectUpdateContent;
const notificationsUpdate = {
	"testEvents": {
		[attendeeId1]: {
			"rev": 0,
			"timestamp": 0,
			"value": toOpaqueJson({ "name": "newId", "args": [42] }),
			"ignoreUnmonitored": true,
		},
	},
} as const satisfies StatesObjectUpdateContent;

describe("Presence", () => {
	describe("events are fired with consistent and final state when", () => {
		let runtime: MockEphemeralRuntime;
		let logger: EventAndErrorTrackingLogger;
		let clock: SinonFakeTimers;
		let presence: ReturnType<typeof prepareConnectedPresence>;
		let latest: LatestRaw<{ x: number; y: number; z: number }>;
		let latestMap: LatestMapRaw<{ a: number; b: number } | { c: number; d: number }>;
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

		function verifyState(attendee: Attendee, verifications: StateVerification[]): void {
			assert.ok(attendee, "Eventing does not reflect new attendee");
			assert.strictEqual(
				attendee.attendeeId,
				"attendeeId-1",
				"Eventing does not reflect new attendee's attendeeId",
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
							latest.getRemote(attendee).value,
							expectedValue,
							"Eventing does not reflect latest value",
						);
						break;
					}
					case "latestMap": {
						assert.deepEqual(
							latestMap.getRemote(attendee).get("key1")?.value,
							expectedValue.key1,
							"Eventing does not reflect latest map value",
						);
						assert.deepEqual(
							latestMap.getRemote(attendee).get("key2")?.value,
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
			presence = prepareConnectedPresence(runtime, "attendeeId-2", "client2", clock, logger);
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

		function setupSharedStatesWorkspace({
			notifications,
		}: { notifications?: true } = {}): void {
			const statesWorkspace = presence.states.getWorkspace("name:testWorkspace", {
				latest: StateFactory.latest({ local: { x: 0, y: 0, z: 0 } }),
				latestMap: StateFactory.latestMap({
					local: { key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } },
				}),
			});
			latest = statesWorkspace.states.latest;
			latestMap = statesWorkspace.states.latestMap;
			if (notifications) {
				const workspace: typeof statesWorkspace = statesWorkspace;
				workspace.add(
					"testEvents",
					Notifications<{ newId: (id: number) => void }>({
						newId: (_attendee: Attendee, _id: number) => {},
					}),
				);
				notificationManager = workspace.states.testEvents;
			}
		}

		function setupMultipleStatesWorkspaces(): void {
			const latestsStates = presence.states.getWorkspace("name:testWorkspace1", {
				latest: StateFactory.latest({ local: { x: 0, y: 0, z: 0 } }),
			});
			const latesetMapStates = presence.states.getWorkspace("name:testWorkspace2", {
				latestMap: StateFactory.latestMap({
					local: { key1: { a: 0, b: 0 }, key2: { c: 0, d: 0 } },
				}),
			});
			latest = latestsStates.states.latest;
			latestMap = latesetMapStates.states.latestMap;
		}

		function setupNotificationsWorkspace(): void {
			const notificationsWorkspace = presence.notifications.getWorkspace(
				"name:testWorkspace",
				{
					testEvents: Notifications<{ newId: (id: number) => void }>({
						newId: (_attendee: Attendee, _id: number) => {},
					}),
				},
			);
			notificationManager = notificationsWorkspace.notifications.testEvents;
		}

		function processUpdates(valueManagerUpdates: GeneralDatastoreMessageContent): void {
			const updates = { "system:presence": attendeeUpdate, ...valueManagerUpdates };

			presence.processSignal(
				[],
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

		function getTestAttendee(): Attendee {
			return presence.attendees.getAttendee("attendeeId-1");
		}

		describe("states workspace", () => {
			let latestUpdatedEventSpy: SinonSpy;
			let latestMapUpdatedEventSpy: SinonSpy;
			let itemUpdatedEventSpy: SinonSpy;

			describe("value is updated where", () => {
				let atteendeeEventSpy: SinonSpy;

				function verify(): void {
					verifyState(getTestAttendee(), [
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

				function setupSpiesAndListeners(): void {
					latestUpdatedEventSpy = spy(verify);
					latestMapUpdatedEventSpy = spy(verify);
					itemUpdatedEventSpy = spy(verify);
					atteendeeEventSpy = spy(verify);

					latest.events.on("remoteUpdated", latestUpdatedEventSpy);
					latestMap.events.on("remoteUpdated", latestMapUpdatedEventSpy);
					latestMap.events.on("remoteItemUpdated", itemUpdatedEventSpy);
					presence.attendees.events.on("attendeeConnected", atteendeeEventSpy);
				}

				it("'latest' update comes before 'latestMap' update in single workspace", async () => {
					// Setup
					setupSharedStatesWorkspace();
					setupSpiesAndListeners();
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
					setupSpiesAndListeners();
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
					setupSpiesAndListeners();
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
					setupSpiesAndListeners();
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
						verifyState(getTestAttendee(), [
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
						latest.events.on("remoteUpdated", latestUpdatedEventSpy);
						latestMap.events.on("remoteUpdated", latestMapUpdatedEventSpy);
						latestMap.events.on("remoteItemRemoved", itemRemovedEventSpy);
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
						processUpdates(itemRemovedUpdate);
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
						processUpdates(itemRemovedUpdate);
						// Verify
						assertSpies();
					});
				});

				describe("and map item is updated", () => {
					function verify(): void {
						verifyState(getTestAttendee(), [
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

						latestMap.events.on("remoteUpdated", latestMapUpdatedEventSpy);
						latestMap.events.on("remoteItemUpdated", itemUpdatedEventSpy);
						latestMap.events.on("remoteItemRemoved", itemRemovedEventSpy);
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

					it("with removal first", () => {
						// Setup
						setupSharedStatesWorkspace();
						const workspace = {
							"s:name:testWorkspace": latestMapUpdate,
						};
						processUpdates(workspace);
						setupSpiesAndListeners();
						const itemRemovedAndItemUpdatedUpdate = {
							"s:name:testWorkspace": itemRemovedAndItemUpdatedMapUpdate,
						} as const satisfies GeneralDatastoreMessageContent;
						// Act
						processUpdates(itemRemovedAndItemUpdatedUpdate);
						// Verify
						assertSpies();
					});

					it("with update first", () => {
						// Setup
						setupSharedStatesWorkspace();
						const workspace = {
							"s:name:testWorkspace": latestMapUpdate,
						};
						processUpdates(workspace);
						setupSpiesAndListeners();
						const itemUpdatedAndItemRemovedUpdate = {
							"s:name:testWorkspace": itemUpdatedAndItemRemovedMapUpdate,
						};
						// Act
						processUpdates(itemUpdatedAndItemRemovedUpdate);
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
				verifyState(getTestAttendee(), [
					{ manager: "latest", expectedValue: { x: 1, y: 1, z: 1 } },
					{
						manager: "latestMap",
						expectedValue: { key1: { a: 1, b: 1 }, key2: { c: 1, d: 1 } },
					},
				]);
			}

			function setupSpiesAndListeners(): void {
				notificationSpy = spy(verify);
				latestSpy = spy(verify);
				attendeeSpy = spy(verify);
				latestMapSpy = spy(verify);

				notificationManager.notifications.on("newId", notificationSpy);
				latest.events.on("remoteUpdated", latestSpy);
				latestMap.events.on("remoteUpdated", latestMapSpy);
				presence.attendees.events.on("attendeeConnected", attendeeSpy);
			}

			function assertSpies(): void {
				assert.ok(notificationSpy.calledOnce, "notification event not fired exactly once");
				assert.ok(latestMapSpy.calledOnce, "latestMap update event not fired exactly once");
				assert.ok(latestSpy.calledOnce, "latest update event not fired exactly once");
				assert.ok(attendeeSpy.calledOnce, "attendee event not fired exactly once");
			}

			it("comes before states workspace update", async () => {
				// Setup
				setupSharedStatesWorkspace();
				setupNotificationsWorkspace();
				setupSpiesAndListeners();
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
				setupSpiesAndListeners();
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
				setupSpiesAndListeners();
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
				setupSharedStatesWorkspace({ notifications: true });
				setupSpiesAndListeners();
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

			it("from unregistered workspace triggers 'workspaceActivated' event", async () => {
				// Setup
				notificationSpy = spy();
				const workspaceActivatedEventSpy = spy((workspaceAddress: WorkspaceAddress) => {
					// Once activated, register the notifications workspace and listener for it's event
					const notificationsWorkspace = presence.notifications.getWorkspace(
						workspaceAddress,
						{
							testEvents: Notifications<{ newId: (id: number) => void }>({
								newId: (_attendee: Attendee, _id: number) => {},
							}),
						},
					);
					notificationsWorkspace.notifications.testEvents.notifications.on(
						"newId",
						notificationSpy,
					);
				});
				presence.events.on("workspaceActivated", (workspaceAddress, type) => {
					if (workspaceAddress === "name:testWorkspace" && type === "Notifications") {
						workspaceActivatedEventSpy(workspaceAddress);
					}
				});
				const workspace = {
					"n:name:testWorkspace": notificationsUpdate,
				};
				// Act
				processUpdates(workspace);

				// Verify
				assert.ok(
					workspaceActivatedEventSpy.calledOnce,
					"workspace activated event not fired",
				);
				assert.ok(
					notificationSpy.calledOnce,
					`notification event not fired exactly once ${notificationSpy.callCount}`,
				);
			});

			it("from an unregistered workspace arrives with state updates", async () => {
				setupMultipleStatesWorkspaces();

				const initialWorkspaceUpdate = {
					"s:name:testWorkspace1": latestUpdate,
					"s:name:testWorkspace2": latestMapUpdate,
				};
				const secondWorkspaceUpdate = {
					"s:name:testWorkspace1": latestUpdateRev2,
					"n:name:testWorkspace": notificationsUpdate,
					"s:name:testWorkspace2": itemUpdatedAndItemRemovedMapUpdate,
				};

				presence.events.on("workspaceActivated", (_, type) => {
					if (type === "Notifications") {
						// Verify initial state maintains consistency
						verifyState(getTestAttendee(), [
							{ manager: "latest", expectedValue: { x: 1, y: 1, z: 1 } },
							{
								manager: "latestMap",
								expectedValue: { key1: { a: 1, b: 1 }, key2: { c: 1, d: 1 } },
							},
						]);
					}
				});

				// Act
				processUpdates(initialWorkspaceUpdate);
				processUpdates(secondWorkspaceUpdate);

				// Verify
				verifyState(getTestAttendee(), [
					{ manager: "latest", expectedValue: { x: 2, y: 2, z: 2 } },
					{
						manager: "latestMap",
						expectedValue: { key1: { a: 2, b: 2 }, key2: undefined },
					},
				]);
			});
		});
	});
});
