/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";
import { describe, it, afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";

import { Latest, Notifications, type PresenceNotifications } from "../index.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockRuntimeSignalSnapshotter } from "./snapshotEphemeralRuntime.js";
import { prepareConnectedPresence } from "./testUtils.js";

describe("Presence", () => {
	describe("batching", () => {
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
			runtime.snapshotSignals = true;

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

		describe("LatestValueManager", () => {
			it("sends signal immediately when allowable latency is 0", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatencyMs: 0 }),
				}); // SIGNAL #1 - intial data is sent immediately

				const { count } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020

				// SIGNAL #2
				count.local = { num: 42 };

				// SIGNAL #3
				count.local = { num: 84 };

				expect(runtime.submittedSignals).toHaveLength(3);
			});

			it("sets timer for default allowableUpdateLatency", async () => {
				// Configure a state workspace
				presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 } /* default allowableUpdateLatencyMs = 60 */),
				}); // will be queued; deadline is now 1070

				// SIGNAL #1
				// The deadline timer will fire at time 1070 and send a single
				// signal with the value from the last signal (num=0).

				clock.tick(100); // Time is now 1110

				expect(runtime.submittedSignals).toHaveLength(1);
			});

			it("batches signals sent within default allowableUpdateLatency", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 } /* default allowableUpdateLatencyMs = 60 */),
				}); // will be queued; deadline is now 1070

				const { count } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued; deadline remains 1070

				clock.tick(10); // Time is now 1030
				count.local = { num: 34 }; // will be queued; deadline remains 1070

				clock.tick(30); // Time is now 1060
				count.local = { num: 22 }; // will be queued; deadline remains 1070

				// SIGNAL #1
				// The deadline timer will fire at time 1070 and send a single
				// signal with the value from the last signal (num=22).

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(20); // Time is now 1080

				clock.tick(10); // Time is now 1090
				count.local = { num: 56 }; // will be queued; deadline is set to 1150

				clock.tick(40); // Time is now 1130
				count.local = { num: 78 }; // will be queued; deadline remains 1150

				clock.tick(10); // Time is now 1140
				count.local = { num: 90 }; // will be queued; deadline remains 1150

				// SIGNAL #2
				// The deadline timer will fire at time 1150 and send a single
				// signal with the value from the last signal (num=90).

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1180

				expect(runtime.submittedSignals).toHaveLength(2);
			});

			it("batches signals sent within a specified allowableUpdateLatency", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatencyMs: 100 }),
				});

				const { count } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020
				count.local = { num: 12 }; // will be queued; deadline is set to 1120

				clock.tick(80); // Time is now 1100
				count.local = { num: 34 }; // will be queued; deadline remains 1120

				// SIGNAL #1
				// The deadline timer will fire at time 1120 and send a single
				// signal with the value from the last signal (num=34).

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1130

				clock.tick(10); // Time is now 1140
				count.local = { num: 56 }; // will be queued; deadline is set to 1240

				clock.tick(40); // Time is now 1180
				count.local = { num: 78 }; // will be queued; deadline remains 1240

				clock.tick(40); // Time is now 1220
				count.local = { num: 90 }; // will be queued; deadline remains 1240

				// SIGNAL #2
				// The deadline timer will fire at time 1240 and send a single
				// signal with the value from the last signal (num=90).

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1250

				expect(runtime.submittedSignals).toHaveLength(2);
			});

			it("queued signal is sent immediately with immediate update message", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatencyMs: 100 }),
					immediateUpdate: Latest({ num: 0 }, { allowableUpdateLatencyMs: 0 }),
				}); // SIGNAL #1 - not queued because it contains a value manager with a latency of 0,
				// so the initial data will be sent immediately

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

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(10); // Time is now 1250

				expect(runtime.submittedSignals).toHaveLength(2);
			});

			it("batches signals with different allowed latencies", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatencyMs: 100 }),
					note: Latest({ message: "" }, { allowableUpdateLatencyMs: 50 }),
				}); // will be queued, deadline is set to 1060

				const { count, note } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020
				note.local = { message: "will be queued" }; // will be queued, deadline remains 1060
				count.local = { num: 12 }; // will be queued; deadline remains 1060

				clock.tick(30); // Time is now 1050
				count.local = { num: 34 }; // will be queued; deadline remains 1060

				clock.tick(10); // Time is now 1060
				note.local = { message: "final message" }; // will be queued; deadline remains 1060

				// SIGNAL #1
				// At time 1060, the deadline timer will fire and send a single signal with the value
				// from the last signal (num=34, message="final message").

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1080

				expect(runtime.submittedSignals).toHaveLength(1);
			});

			it("batches signals from multiple workspaces", async () => {
				// Configure two state workspaces
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatencyMs: 100 }),
				}); // will be queued, deadline is 1110
				const stateWorkspace2 = presence.getStates("name:testStateWorkspace2", {
					note: Latest({ message: "" }, { allowableUpdateLatencyMs: 60 }),
				}); // will be queued, deadline is 1070

				const { count } = stateWorkspace.props;
				const { note } = stateWorkspace2.props;

				clock.tick(10); // Time is now 1020
				note.local = { message: "will be queued" }; // will be queued, deadline is 1080
				count.local = { num: 12 }; // will be queued; deadline remains 1080

				clock.tick(30); // Time is now 1050
				count.local = { num: 34 }; // will be queued; deadline remains 1080

				clock.tick(10); // Time is now 1060
				note.local = { message: "final message" }; // will be queued; deadline remains 1080

				// SIGNAL #1
				// The deadline timer will fire at time 1080 and send a single
				// signal with the values from the last workspace updates (num=34, message="final message").

				// It's necessary to tick the timer beyond the deadline so the timer will fire.
				clock.tick(30); // Time is now 1090

				expect(runtime.submittedSignals).toHaveLength(1);
			});
		});

		describe("NotificationsManager", () => {
			it("notification signals are sent immediately", async () => {
				runtime.snapshotSignals = false;
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
						{},
					),
				);

				const { testEvents } = notificationsWorkspace.props;

				clock.tick(10); // Time is now 1020

				clock.tick(30); // Time is now 1050
				// SIGNAL #1
				testEvents.emit.broadcast("newId", 77);

				expect(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					(runtime.submittedSignals.at(-1)?.[1] as any).data[
						"n:name:testNotificationWorkspace"
					].testEvents["sessionId-2"].value.args,
				).toEqual([77]);

				clock.tick(10); // Time is now 1060
				// SIGNAL #2
				testEvents.emit.broadcast("newId", 88);

				expect(runtime.submittedSignals).toHaveLength(2);

				expect(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					(runtime.submittedSignals.at(-1)?.[1] as any).data[
						"n:name:testNotificationWorkspace"
					].testEvents["sessionId-2"].value.args,
				).toEqual([88]);
			});

			it("notification signals cause queued messages to be sent immediately", async () => {
				// Configure a state workspaces
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					count: Latest({ num: 0 }, { allowableUpdateLatencyMs: 100 }),
				}); // will be queued, deadline is 1110

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
				count.local = { num: 12 }; // will be queued, deadline remains 1110

				clock.tick(10); // Time is now 1030
				count.local = { num: 34 }; // will be queued, deadline remains 1110

				clock.tick(10); // Time is now 1040
				count.local = { num: 56 }; // will be queued, deadline remains 1110

				clock.tick(20); // Time is now 1060
				testEvents.emit.broadcast("newId", 99);
				// SIGNAL #1
				// The notification will cause an immediate broadcast of the queued signal
				// along with the notification signal.

				clock.tick(30); // Time is now 1090
				// SIGNAL #2
				testEvents.emit.broadcast("newId", 111);

				expect(runtime.submittedSignals).toHaveLength(2);
			});
		});
	});
});
