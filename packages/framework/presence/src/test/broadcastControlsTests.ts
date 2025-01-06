/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import type { BroadcastControls, BroadcastControlSettings } from "../broadcastControls.js";
import type { IPresence } from "../presence.js";
import { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";

const testDefaultAllowableUpdateLatencyMs = 100;

/**
 * Adds set of test for common {@link BroadcastControls} implementations.
 *
 * @param createControls - Function to create the `controls` provider object
 */
export function addControlsTests(
	createControls: (
		presence: IPresence,
		controlSettings?: BroadcastControlSettings,
	) => { controls: BroadcastControls },
): void {
	describe("controls allowableUpdateLatencyMs", () => {
		it("can be specified during create", () => {
			// Setup
			const presence = createPresenceManager(new MockEphemeralRuntime());

			// Act
			const controlsProvider = createControls(presence, {
				allowableUpdateLatencyMs: testDefaultAllowableUpdateLatencyMs,
			});

			// Verify
			assert.equal(
				controlsProvider.controls.allowableUpdateLatencyMs,
				testDefaultAllowableUpdateLatencyMs,
			);
		});

		it("can be changed", () => {
			// Setup
			const presence = createPresenceManager(new MockEphemeralRuntime());
			const controlsProvider = createControls(presence, {
				allowableUpdateLatencyMs: testDefaultAllowableUpdateLatencyMs,
			});

			// Act
			controlsProvider.controls.allowableUpdateLatencyMs = 200;

			// Verify
			assert.equal(controlsProvider.controls.allowableUpdateLatencyMs, 200);
		});

		it("can be reset to system default", () => {
			// Setup
			// First read value of system default from init without any settings
			let presence = createPresenceManager(new MockEphemeralRuntime());
			let controlsProvider = createControls(presence, undefined);
			const systemDefault = controlsProvider.controls.allowableUpdateLatencyMs;
			assert.notEqual(
				testDefaultAllowableUpdateLatencyMs,
				systemDefault,
				"test internal error: Test value matches system default value",
			);

			// Recreate controls with custom settings specified
			presence = createPresenceManager(new MockEphemeralRuntime());
			controlsProvider = createControls(presence, {
				allowableUpdateLatencyMs: testDefaultAllowableUpdateLatencyMs,
			});

			// Act
			controlsProvider.controls.allowableUpdateLatencyMs = undefined;

			// Verify
			assert.equal(controlsProvider.controls.allowableUpdateLatencyMs, systemDefault);
		});
	});
}
