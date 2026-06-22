/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaManager,
	MockQuorumClients,
	MockAudience,
} from "@fluidframework/test-runtime-utils/internal";

import { ContainerRuntime, getDeviceSpec } from "../containerRuntime.js";
import { FluidDataStoreRegistry } from "../dataStoreRegistry.js";

// Capture the full property descriptor (not just the value) so we can restore the original getter-backed property after tests override it.
// Uses an IIFE so the assert narrows the type to a definite PropertyDescriptor, avoiding
// non-null assertions in restoreNavigator (TypeScript can't track narrowing across function boundaries).
const originalNavigatorDescriptor = (() => {
	const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
	assert(
		desc !== undefined,
		"navigator must be defined in the test environment (requires Node 22)",
	);
	return desc;
})();

function setNavigator(navigator: Partial<Navigator & { deviceMemory?: number }>) {
	// In Node 22+, globalThis.navigator is a read-only getter, so direct
	// assignment throws. Use Object.defineProperty to override it.
	Object.defineProperty(globalThis, "navigator", {
		value: navigator,
		writable: true,
		configurable: true,
	});
}

function restoreNavigator() {
	Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
}

describe("Hardware Stats", () => {
	let mockLogger = new MockLogger();
	let mockContext: Partial<IContainerContext> = {
		deltaManager: new MockDeltaManager(),
		audience: new MockAudience(),
		quorum: new MockQuorumClients(),
		taggedLogger: mockLogger,
		clientDetails: { capabilities: { interactive: true } },
		updateDirtyContainerState: (dirty: boolean) => {},
		getLoadedFromVersion: () => undefined,
	};

	const getDeviceSpecEvents = () =>
		mockLogger.events
			.filter(
				(event) =>
					event.eventName === "ContainerRuntime:ContainerLoadStats" &&
					event.deviceSpec !== undefined,
			)
			.map(
				(event) =>
					JSON.parse(event.deviceSpec as string) as {
						deviceMemory?: number;
						hardwareConcurrency?: number;
					},
			);

	const loadContainer = async () =>
		ContainerRuntime.loadRuntime2({
			context: mockContext as IContainerContext,
			registry: new FluidDataStoreRegistry([]),
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: { state: "disabled" },
				},
			},
			provideEntryPoint: async () => ({
				myProp: "myValue",
			}),
			existing: false,
		});

	afterEach(() => {
		restoreNavigator();
	});

	beforeEach(async () => {
		mockLogger = new MockLogger();
		mockContext = {
			deltaManager: new MockDeltaManager(),
			audience: new MockAudience(),
			quorum: new MockQuorumClients(),
			taggedLogger: mockLogger,
			clientDetails: { capabilities: { interactive: true } },
			updateDirtyContainerState: (dirty: boolean) => {},
			getLoadedFromVersion: () => undefined,
		};
	});

	it("should generate correct hardware stats with browser-like navigator", async () => {
		const navigator = {
			deviceMemory: 10,
			hardwareConcurrency: 8,
		};
		setNavigator(navigator);
		// testing function
		const { deviceMemory, hardwareConcurrency } = getDeviceSpec();
		assert.strictEqual(deviceMemory, 10, "incorrect deviceMemory value");
		assert.strictEqual(hardwareConcurrency, 8, "incorrect hardwareConcurrency value");

		await loadContainer();

		// checking telemetry
		const events = getDeviceSpecEvents();
		assert(events.length > 0, "No ContainerLoadStats event with deviceSpec found");
		assert.strictEqual(events[0].deviceMemory, 10, "incorrect deviceMemory logged");
		assert.strictEqual(
			events[0].hardwareConcurrency,
			8,
			"incorrect hardwareConcurrency logged",
		);
	});

	// If Node ever adds support for deviceMemory, we can collapse both tests into one
	// and stop mocking navigator entirely.
	it("should generate correct hardware stats with Node-native navigator", async () => {
		// Node 22+ provides a built-in navigator with hardwareConcurrency but not deviceMemory.
		restoreNavigator();
		// testing function
		const { deviceMemory, hardwareConcurrency } = getDeviceSpec();
		assert.strictEqual(deviceMemory, undefined, "deviceMemory should be undefined on Node");
		assert.strictEqual(
			typeof hardwareConcurrency,
			"number",
			"hardwareConcurrency should be a number on Node",
		);

		await loadContainer();

		// checking telemetry
		const events = getDeviceSpecEvents();
		assert(events.length > 0, "No ContainerLoadStats event with deviceSpec found");
		assert.strictEqual(
			events[0].deviceMemory,
			undefined,
			"deviceMemory should be undefined on Node",
		);
		assert.strictEqual(
			typeof events[0].hardwareConcurrency,
			"number",
			"hardwareConcurrency should be a number on Node",
		);
	});
});
