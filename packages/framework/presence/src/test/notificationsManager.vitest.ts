/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";
import { describe, it, afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";

import { Notifications, type PresenceNotifications } from "../index.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockRuntimeSignalSnapshotter } from "./snapshotEphemeralRuntime.js";
import { prepareConnectedPresence } from "./testUtils.js";

describe("Presence", () => {
	describe("NotificationsManager", () => {
		describe("snapshot tests", () => {
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
				// SIGNAL #1
				testEvents.emit.broadcast("newId", 77);

				clock.tick(10); // Time is now 1060
				// SIGNAL #2
				testEvents.emit.broadcast("newId", 88);

				expect(runtime.submittedSignals).toHaveLength(2);

				// Verify first signal set the newId to 77
				let signal = runtime.submittedSignals[0];
				expect(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					(signal?.[1] as any).data["n:name:testNotificationWorkspace"].testEvents[
						"sessionId-2"
					].value.args,
				).toEqual([77]);

				// Verify first signal set the newId to 88
				signal = runtime.submittedSignals[1];
				expect(
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					(signal?.[1] as any).data["n:name:testNotificationWorkspace"].testEvents[
						"sessionId-2"
					].value.args,
				).toEqual([88]);
			});
		});
	});
});
