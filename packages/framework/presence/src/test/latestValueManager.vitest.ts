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

				clock.setSystemTime(initialTime);

				// Set up the presence connection
				presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);
			});

			afterEach(() => {
				clock.reset();

				// If the test passed so far, check final expectations.
				// if (this.currentTest?.state === "passed") {
				// 	assertFinalExpectations(runtime, logger);
				// }
				// done();
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

				clock.tick(10);

				// This will trigger the third signal
				data.local = { num: 42 };

				clock.tick(10);
			});

			it("batches signals sent within the allowableUpdateLatency", async () => {
				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					data: Latest({ num: 0 }, { allowableUpdateLatency: 100, forcedRefreshInterval: 0 }),
				});

				const { data } = stateWorkspace.props;

				clock.tick(10);
				// This will trigger the third signal
				data.local = { num: 42 };

				clock.tick(10);
				data.local = { num: 65 };

				clock.tick(10);

			});
		});
	});
});
