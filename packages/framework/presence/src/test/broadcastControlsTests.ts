/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import type { BroadcastControls, BroadcastControlSettings } from "../broadcastControls.js";
import type { Presence } from "../presence.js";
import { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";

const testDefaultAllowableUpdateLatencyMs = 100;

/**
 * Adds set of test for common {@link BroadcastControls} implementations.
 *
 * @param createSettings - Function to create the `settings` provider object
 */
export function addSettingsTests(
	createSettings: (
		presence: Presence,
		controlSettings?: BroadcastControlSettings,
	) => { settings: BroadcastControls },
): void {
	describe("settings allowableUpdateLatencyMs", () => {
		it("can be specified during create", () => {
			// Setup
			const presence = createPresenceManager(new MockEphemeralRuntime());

			// Act
			const settingsProvider = createSettings(presence, {
				allowableUpdateLatencyMs: testDefaultAllowableUpdateLatencyMs,
			});

			// Verify
			assert.equal(
				settingsProvider.settings.allowableUpdateLatencyMs,
				testDefaultAllowableUpdateLatencyMs,
			);
		});

		it("can be changed", () => {
			// Setup
			const presence = createPresenceManager(new MockEphemeralRuntime());
			const controlsProvider = createSettings(presence, {
				allowableUpdateLatencyMs: testDefaultAllowableUpdateLatencyMs,
			});

			// Act
			controlsProvider.settings.allowableUpdateLatencyMs = 200;

			// Verify
			assert.equal(controlsProvider.settings.allowableUpdateLatencyMs, 200);
		});

		it("can be reset to system default", () => {
			// Setup
			// First read value of system default from init without any settings
			let presence = createPresenceManager(new MockEphemeralRuntime());
			let settingsProvider = createSettings(presence, undefined);
			const systemDefault = settingsProvider.settings.allowableUpdateLatencyMs;
			assert.notEqual(
				testDefaultAllowableUpdateLatencyMs,
				systemDefault,
				"test internal error: Test value matches system default value",
			);

			// Recreate settings with custom controls specified
			presence = createPresenceManager(new MockEphemeralRuntime());
			settingsProvider = createSettings(presence, {
				allowableUpdateLatencyMs: testDefaultAllowableUpdateLatencyMs,
			});

			// Act
			settingsProvider.settings.allowableUpdateLatencyMs = undefined;

			// Verify
			assert.equal(settingsProvider.settings.allowableUpdateLatencyMs, systemDefault);
		});
	});
}
