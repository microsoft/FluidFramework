/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";
import {
	describe,
	it,
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
} from "vitest";

import { Latest, Notifications, type PresenceNotifications } from "../index.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockRuntimeSignalSnapshotter } from "./snapshotEphemeralRuntime.js";
import { generateBasicClientJoin, prepareConnectedPresence } from "./testUtils.js";

describe("Presence", () => {
	describe("LatestValueManager", () => {
		describe("batching", () => {
			// IMPORTANT: All tests in this suite have an extra signal for each workspace that is initialized in the test.
			// This is a bug. See AB#24392. This means that when looking at snapshots from these tests, the "real" snapshots
			// start at 2, not 1, for most tests. Some tests may have additional incorrect leading signals. Such examples
			// are noted inline.
			let runtime: MockRuntimeSignalSnapshotter;
			let logger: EventAndErrorTrackingLogger;
			const initialTime = 1000;
			let clock: SinonFakeTimers;
			let presence: ReturnType<typeof createPresenceManager>;

			beforeAll(async () => {
				clock = useFakeTimers();
			});

			beforeEach(() => {
				logger = new EventAndErrorTrackingLogger();
				runtime = new MockRuntimeSignalSnapshotter(logger);

				// We are configuring the runtime to be in a connected state, so ensure it looks connected
				runtime.connected = true;

				// Note that while the initialTime is set to 1000, the prepareConnectedPresence call advances
				// it to 1010 so all tests start at that time.
				clock.setSystemTime(initialTime);

				// Disable submitting signals with a dummy function. This ensures we don't capture signals from
				// test setup, like the prepareConnectedPresence call.
				const submitSignalOriginal = runtime.submitSignal;
				runtime.submitSignal = () => {};

				// Set up the presence connection
				presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);

				// Restore the submiSignal function
				runtime.submitSignal = submitSignalOriginal;
			});

			afterEach(() => {
				clock.reset();
			});

			afterAll(() => {
				clock.restore();
			});

			it("sends signal immediately when allowable latency is 0", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatency: 0, forcedRefreshInterval: 0 }),
				}); // SIGNAL #1 DUE TO AB#24392

				const { count } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020

				// SIGNAL #2
				count.local = { num: 42 };
			});

			it("batches signals sent within the allowableUpdateLatency", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatency: 100, forcedRefreshInterval: 0 }),
				}); // SIGNAL #1 DUE TO AB#24392

				const { count } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued; deadline is set to 1120

				clock.tick(80); // Time is now 1100
				count.local = { num: 34 }; // will be queued; deadline remains 1120

				clock.tick(30); // Time is now 1130
				const expectedClientJoin = generateBasicClientJoin(clock.now, {
					clientSessionId: "sessionId-3",
					clientConnectionId: "client3",
					updateProviders: ["client2"],
					averageLatency: 10,
				});
				presence.processSignal("", expectedClientJoin, true);
				// SIGNAL #2
				// The deadline has now passed, so the timer will fire and send a single
				// signal with the value from the last signal (num=34).

				clock.tick(10); // Time is now 1140
				count.local = { num: 56 }; // will be queued; deadline is set to 1240

				clock.tick(40); // Time is now 1180
				count.local = { num: 78 }; // will be queued; deadline remains 1240

				clock.tick(40); // Time is now 1220
				count.local = { num: 90 }; // will be queued; deadline remains 1240

				clock.tick(30); // Time is now 1250
				// SIGNAL #3
				// The deadline has now passed, so the timer will fire and send a single
				// signal with the value from the last signal (num=90).
			});

			it("queued signal is sent immediately with immediate update message", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatency: 100, forcedRefreshInterval: 0 }),
					immediateUpdate: Latest(
						{ num: 0 },
						{ allowableUpdateLatency: 0, forcedRefreshInterval: 0 },
					),
				}); // SIGNAL #1 DUE TO AB#24392

				const { count, immediateUpdate } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued; deadline is set to 1120

				clock.tick(80); // Time is now 1100
				count.local = { num: 34 }; // will be queued; deadline remains 1120

				clock.tick(10); // Time is now 1110
				immediateUpdate.local = { num: 56 };
				// SIGNAL #2
				// This should cause the queued signals to be merged with this immediately-sent
				// signal with the value from the last signal (num=34).
			});

			it("batches signals with different allowed latencies", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatency: 100, forcedRefreshInterval: 0 }),
					note: Latest(
						{ message: "" },
						{ allowableUpdateLatency: 50, forcedRefreshInterval: 0 },
					),
				}); // SIGNAL #1 DUE TO AB#24392

				const { count, note } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020
				note.local = { message: "will be queued" }; // will be queued, deadline is set to 1070
				count.local = { num: 12 }; // will be queued; deadline remains 1070

				clock.tick(30); // Time is now 1050
				count.local = { num: 34 }; // will be queued; deadline remains 1070

				clock.tick(10); // Time is now 1060
				note.local = { message: "final message" }; // will be queued; deadline remains 1070

				clock.tick(30); // Time is now 1080
				// SIGNAL #2
				// The deadline has now passed, so the timer will fire and send a single
				// signal with the value from the last signal (num=34, message="final message").
			});

			it("batches signals from multiple workspaces", async () => {
				// Configure two state workspaces
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatency: 100, forcedRefreshInterval: 0 }),
				}); // SIGNAL #1 DUE TO AB#24392
				const stateWorkspace2 = presence.getStates("name:testStateWorkspace2", {
					note: Latest(
						{ message: "" },
						{ allowableUpdateLatency: 50, forcedRefreshInterval: 0 },
					),
				}); // SIGNAL #2 DUE TO AB#24392

				const { count } = stateWorkspace.props;
				const { note } = stateWorkspace2.props;

				clock.tick(10); // Time is now 1020
				note.local = { message: "will be queued" }; // will be queued, deadline is set to 1070
				count.local = { num: 12 }; // will be queued; deadline remains 1070

				clock.tick(30); // Time is now 1050
				count.local = { num: 34 }; // will be queued; deadline remains 1070

				clock.tick(10); // Time is now 1060
				note.local = { message: "final message" }; // will be queued; deadline remains 1070

				// Messages are auto-sent at time 1070, the deadline

				clock.tick(30); // Time is now 1090
				// SIGNAL #3
				// The deadline has now passed, so the timer will fire at time 1070 and send a single
				// signal with the values from the last workspace updates (num=34, message="final message").
			});

			it("notification signals are sent immediately", async () => {
				// Configure a notifications workspaces
				// eslint-disable-next-line @typescript-eslint/ban-types
				const notificationsWorkspace: PresenceNotifications<{}> = presence.getNotifications(
					"name:testNotificationWorkspace",
					{},
				);

				notificationsWorkspace.add(
					"testEvents",
					Notifications<
						// Below explicit generic specification should not be required.
						{
							newId: (id: number) => void;
						},
						"testEvents"
					>(
						// A default handler is not required
						{
							newId: (client, newId) => {
								// do nothing?
							},
						},
					),
				);

				const { testEvents } = notificationsWorkspace.props;

				clock.tick(10); // Time is now 1020

				clock.tick(30); // Time is now 1050
				testEvents.emit.broadcast("newId", 77);
				// SIGNAL #1

				clock.tick(10);
				testEvents.emit.broadcast("newId", 99);
				// SIGNAL #2
			});

			// TODO: RESULTS NOT VALID!!!
			it("notification signals cause queued messages to be sent immediately", async () => {
				// Configure a state workspaces
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatency: 100, forcedRefreshInterval: 0 }),
				}); // SIGNAL #1 DUE TO AB#24392

				// eslint-disable-next-line @typescript-eslint/ban-types
				const notificationsWorkspace: PresenceNotifications<{}> = presence.getNotifications(
					"name:testNotificationWorkspace",
					{},
				);

				notificationsWorkspace.add(
					"testEvents",
					Notifications<
						// Below explicit generic specification should not be required.
						{
							newId: (id: number) => void;
						},
						"testEvents"
					>(
						// A default handler is not required
						{},
					),
				);

				const { count } = stateWorkspace.props;
				const { testEvents } = notificationsWorkspace.props;

				testEvents.notifications.on("newId", (client, newId) => {
					// do nothing
				});

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued, deadline is set to 1120

				clock.tick(30); // Time is now 1050
				testEvents.emit.broadcast("newId", 99);
				// SIGNAL #2
				// The deadline has now passed, so the timer will fire and send a
				// signal with the value from the last signal (num=12)
				// There should also be a signal for the notification, which is NOT
				// being sent
			});
		});
	});
});
