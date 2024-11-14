/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";
import {
	describe,
	it,
	afterAll as after,
	afterEach,
	beforeAll as before,
	beforeEach,
} from "vitest";

import { Latest } from "../index.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockRuntimeSignalSnapshotter } from "./snapshotEphemeralRuntime.js";
import { prepareConnectedPresence } from "./testUtils.js";

describe("Presence", () => {
	describe("LatestValueManager", () => {
		describe("batching", () => {
			// Note: this test setup mimics the setup in src/test/presenceManager.spec.ts
			let runtime: MockRuntimeSignalSnapshotter;
			let logger: EventAndErrorTrackingLogger;
			const initialTime = 1000;
			let clock: SinonFakeTimers;
			let presence: ReturnType<typeof createPresenceManager>;

			before(async () => {
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

				// Set up the presence connection
				presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);
			});

			afterEach(() => {
				clock.reset();
			});

			after(() => {
				clock.restore();
			});

			it("sends signal immediately when allowable latency is 0", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					data: Latest({ num: 0 }, { allowableUpdateLatency: 0, forcedRefreshInterval: 0 }),
				});

				const { data } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020

				// This will trigger the third signal
				data.local = { num: 42 };

				clock.tick(10); // Time is now 1030
			});

			it("batches signals sent within the allowableUpdateLatency", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					data: Latest({ num: 0 }, { allowableUpdateLatency: 100, forcedRefreshInterval: 0 }),
				});

				const { data } = stateWorkspace.props;

				clock.tick(10); // Time is now 1020
				data.local = { num: 12 }; // will be queued; deadline is set to 1120

				clock.tick(80); // Time is now 1100
				data.local = { num: 34 }; // will be queued; deadline remains 1120

				clock.tick(30); // Time is now 1130
				// The deadline has now passed, so the timer will fire and send a single
				// signal with the value from the last signal (num=34). This is signal #3
				// for this test.

				clock.tick(10); // Time is now 1140
				data.local = { num: 56 }; // will be queued; deadline is set to 1240

				clock.tick(40); // Time is now 1180
				data.local = { num: 78 }; // will be queued; deadline remains 1240

				clock.tick(40); // Time is now 1220
				data.local = { num: 90 }; // will be queued; deadline remains 1240

				clock.tick(30); // Time is now 1250
				// The deadline has now passed, so the timer will fire and send a single
				// signal with the value from the last signal (num=90). This is signal #4
				// for this test.
			});
		});
	});
});
