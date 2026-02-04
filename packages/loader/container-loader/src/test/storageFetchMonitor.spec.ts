/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";

import type { IDeltaManagerInternalEvents } from "../deltaManager.js";
import { StorageFetchMonitor } from "../storageFetchMonitor.js";

class MockDeltaManagerForStorageFetch extends TypedEventEmitter<IDeltaManagerInternalEvents> {
	/**
	 * Simulate storage fetch completion event
	 */
	emitStorageFetchComplete(reason: string = "test"): void {
		this.emit("storageFetchComplete", reason);
	}
}

describe("StorageFetchMonitor", () => {
	let monitor: StorageFetchMonitor;
	let mockDeltaManager: MockDeltaManagerForStorageFetch;

	beforeEach(() => {
		mockDeltaManager = new MockDeltaManagerForStorageFetch();
	});

	afterEach(() => {
		monitor?.dispose();
	});

	it("Calls listener when storageFetchComplete event is emitted", () => {
		let fetchComplete = false;

		monitor = new StorageFetchMonitor(
			mockDeltaManager,
			() => {
				fetchComplete = true;
			},
			false, // fetchAlreadyComplete
		);

		assert(!fetchComplete, "Listener should not be called yet");
		mockDeltaManager.emitStorageFetchComplete();
		assert(fetchComplete, "Listener should be called after storageFetchComplete event");
	});

	it("Calls listener via queueMicrotask when fetchAlreadyComplete is true", async () => {
		let fetchComplete = false;

		monitor = new StorageFetchMonitor(
			mockDeltaManager,
			() => {
				fetchComplete = true;
			},
			true, // fetchAlreadyComplete
		);

		// Listener should not be called synchronously
		assert(!fetchComplete, "Listener should not be called synchronously");

		// Wait for microtask to execute
		await Promise.resolve();
		assert(fetchComplete, "Listener should be called via queueMicrotask");
	});

	it("Only calls listener once even if event fires multiple times", () => {
		let callCount = 0;

		monitor = new StorageFetchMonitor(
			mockDeltaManager,
			() => {
				callCount++;
			},
			false,
		);

		mockDeltaManager.emitStorageFetchComplete();
		assert.equal(callCount, 1, "Listener should be called once");

		mockDeltaManager.emitStorageFetchComplete();
		assert.equal(callCount, 1, "Listener should still only be called once");
	});

	it("Dispose removes listener and sets disposed flag", () => {
		let fetchComplete = false;

		monitor = new StorageFetchMonitor(
			mockDeltaManager,
			() => {
				fetchComplete = true;
			},
			false,
		);

		monitor.dispose();

		assert(monitor.disposed, "dispose() should set disposed flag");
		assert.equal(
			mockDeltaManager.listenerCount("storageFetchComplete"),
			0,
			"StorageFetchMonitor.dispose should remove listener",
		);

		// Event after dispose should not trigger listener
		mockDeltaManager.emitStorageFetchComplete();
		assert(!fetchComplete, "Listener should not be called after dispose");
	});

	it("Dispose is idempotent", () => {
		monitor = new StorageFetchMonitor(mockDeltaManager, () => {}, false);

		monitor.dispose();
		assert(monitor.disposed, "Should be disposed after first dispose()");

		// Second dispose should not throw
		monitor.dispose();
		assert(monitor.disposed, "Should still be disposed after second dispose()");
	});

	it("Does not subscribe to event when fetchAlreadyComplete is true", () => {
		monitor = new StorageFetchMonitor(mockDeltaManager, () => {}, true);

		assert.equal(
			mockDeltaManager.listenerCount("storageFetchComplete"),
			0,
			"Should not add listener when fetch already complete",
		);
	});

	it("Does not call listener if disposed before microtask executes", async () => {
		let fetchComplete = false;

		monitor = new StorageFetchMonitor(
			mockDeltaManager,
			() => {
				fetchComplete = true;
			},
			true, // fetchAlreadyComplete - triggers microtask path
		);

		// Dispose immediately, before microtask can execute
		monitor.dispose();

		// Wait for microtask to execute
		await Promise.resolve();

		// Listener should not have been called because we disposed before the microtask ran
		assert(!fetchComplete, "Listener should not be called after dispose");
	});
});
