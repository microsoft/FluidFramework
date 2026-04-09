/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaManager,
	MockQuorumClients,
	MockAudience,
} from "@fluidframework/test-runtime-utils/internal";

import { ContainerRuntime, getDeviceSpec } from "../containerRuntime.js";
import { FluidDataStoreRegistry } from "../dataStoreRegistry.js";

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function setNavigator(
	// eslint-disable-next-line @rushstack/no-new-null -- testing behavior with global
	navigator: Partial<Navigator & { deviceMemory?: number }> | undefined | null,
) {
	// In Node 22+, globalThis.navigator is a read-only getter, so direct
	// assignment throws. Use Object.defineProperty to override it.
	Object.defineProperty(globalThis, "navigator", {
		value: navigator,
		writable: true,
		configurable: true,
	});
}

function restoreNavigator() {
	if (originalNavigatorDescriptor === undefined) {
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- this branch can be removed after upgrading to Node 22, which always provides a built-in navigator descriptor (AB#68707)
		delete (globalThis as Record<string, unknown>).navigator;
	} else {
		Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
	}
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

	const getDeviceSpecEvents = (): ITelemetryBaseEvent[] =>
		mockLogger.events.filter((event) => event.eventName === "DeviceSpec");

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

	it("should generate correct hardware stats with regular navigator", async () => {
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
		assert(events !== undefined, "No deviceSpec event found");
		assert.strictEqual(events[0].deviceMemory, 10, "incorrect deviceMemory logged");
		assert.strictEqual(
			events[0].hardwareConcurrency,
			8,
			"incorrect hardwareConcurrency logged",
		);
	});

	it("should generate correct hardware stats with null navigator", async () => {
		// eslint-disable-next-line unicorn/no-null -- testing behavior with global
		const navigator = null;
		setNavigator(navigator);
		// testing function
		const { deviceMemory, hardwareConcurrency } = getDeviceSpec();
		assert.strictEqual(deviceMemory, undefined, "incorrect deviceMemory value");
		assert.strictEqual(hardwareConcurrency, undefined, "incorrect hardwareConcurrency value");

		await loadContainer();

		// checking telemetry
		const events = getDeviceSpecEvents();
		assert(events !== undefined, "No deviceSpec event found");
		assert.strictEqual(events[0].deviceMemory, undefined, "incorrect deviceMemory logged");
		assert.strictEqual(
			events[0].hardwareConcurrency,
			undefined,
			"incorrect hardwareConcurrency logged",
		);
	});

	it("should generate correct hardware stats with undefined navigator", async () => {
		const navigator = undefined;
		setNavigator(navigator);
		// testing function
		const { deviceMemory, hardwareConcurrency } = getDeviceSpec();
		assert.strictEqual(deviceMemory, undefined, "incorrect deviceMemory value");
		assert.strictEqual(hardwareConcurrency, undefined, "incorrect hardwareConcurrency value");

		await loadContainer();

		// checking telemetry
		const events = getDeviceSpecEvents();
		assert(events !== undefined, "No deviceSpec event found");
		assert.strictEqual(events[0].deviceMemory, undefined, "incorrect deviceMemory logged");
		assert.strictEqual(
			events[0].hardwareConcurrency,
			undefined,
			"incorrect hardwareConcurrency logged",
		);
	});
});
