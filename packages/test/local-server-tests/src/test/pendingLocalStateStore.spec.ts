/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { ICodeDetailsLoader } from "@fluidframework/container-definitions/internal";
import {
	asLegacyAlpha,
	createDetachedContainer,
	loadFrozenContainerFromPendingState,
	PendingLocalStateStore,
	type ContainerAlpha,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { LocalResolver } from "@fluidframework/local-driver/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { ITestFluidObject } from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

describe("PendingLocalStateStore End-to-End Tests", () => {
	/**
	 * Helper function to initialize a container with test data
	 */
	const initializeContainer = async (): Promise<{
		container: ContainerAlpha;
		testFluidObject: ITestFluidObject;
		urlResolver: LocalResolver;
		codeLoader: ICodeDetailsLoader;
		loaderProps: ILoaderProps;
	}> => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { urlResolver, codeDetails, codeLoader, loaderProps } = createLoader({
			deltaConnectionServer,
		});

		const container = asLegacyAlpha(
			await createDetachedContainer({
				codeDetails,
				...loaderProps,
			}),
		);

		const testFluidObject = (await container.getEntryPoint()) as ITestFluidObject;
		assert(
			testFluidObject !== undefined,
			"Expected entrypoint to be a valid ITestFluidObject",
		);

		return {
			container,
			testFluidObject,
			urlResolver,
			codeLoader,
			loaderProps,
		};
	};

	describe("container state persistence across sessions", () => {
		it("should persist and restore container state across sessions", async () => {
			const store = new PendingLocalStateStore<string>();

			// Create container and add data
			const { container, testFluidObject, urlResolver, codeLoader, loaderProps } =
				await initializeContainer();

			// Add data in detached state
			testFluidObject.root.set("detached-key1", "detached-value1");
			testFluidObject.root.set("detached-key2", 42);

			// Attach and add more data
			await container.attach(urlResolver.createCreateNewRequest("test-doc"));
			testFluidObject.root.set("attached-key1", "attached-value1");

			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to have valid URL");

			// Disconnect and add offline data
			container.disconnect();
			testFluidObject.root.set("offline-key1", "offline-value1");

			// Get pending state and store it
			const pendingState = await container.getPendingLocalState();
			store.set("session1", pendingState);

			// Add more offline data (simulating continued offline work)
			testFluidObject.root.set("offline-key2", "offline-value2");
			const pendingState2 = await container.getPendingLocalState();
			store.set("session2", pendingState2);

			// Verify store contains both states (should deduplicate to same URL)
			assert.strictEqual(store.size, 2, "Store should contain 2 session states");
			assert(store.has("session1"), "Store should contain session1");
			assert(store.has("session2"), "Store should contain session2");

			// Restore latest container state from store
			const storedState = store.get("session2");
			assert(storedState !== undefined, "Should retrieve session2 state");

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory: loaderProps.documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: storedState,
			});

			const restoredTestObj = (await frozenContainer.getEntryPoint()) as ITestFluidObject;
			assert(
				restoredTestObj !== undefined,
				"Expected restored container to have valid entrypoint",
			);

			// Verify all data is restored
			assert.strictEqual(
				restoredTestObj.root.get("detached-key1"),
				"detached-value1",
				"Detached data should be restored",
			);
			assert.strictEqual(
				restoredTestObj.root.get("detached-key2"),
				42,
				"Detached numeric data should be restored",
			);
			assert.strictEqual(
				restoredTestObj.root.get("attached-key1"),
				"attached-value1",
				"Attached data should be restored",
			);
			assert.strictEqual(
				restoredTestObj.root.get("offline-key1"),
				"offline-value1",
				"Offline data should be restored",
			);
			assert.strictEqual(
				restoredTestObj.root.get("offline-key2"),
				"offline-value2",
				"Additional offline data should be restored",
			);
		});

		it("should handle container state deduplication in real scenarios", async () => {
			const store = new PendingLocalStateStore<string>();

			// Create container with initial data
			const { container, testFluidObject, urlResolver, codeLoader, loaderProps } =
				await initializeContainer();

			// Add initial data
			testFluidObject.root.set("shared-key", "initial-value");
			await container.attach(urlResolver.createCreateNewRequest("dedup-test"));

			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to have valid URL");

			// Create multiple operations that will be deduplicated
			container.disconnect();

			// Add multiple values - these will create ops with sequence numbers
			for (let i = 0; i < 5; i++) {
				testFluidObject.root.set(`op-key-${i}`, `op-value-${i}`);
			}

			// Get first pending state
			const pendingState1 = await container.getPendingLocalState();
			store.set("dedup-session1", pendingState1);

			// Add more operations (some overlapping)
			for (let i = 3; i < 8; i++) {
				testFluidObject.root.set(`op-key-${i}`, `updated-value-${i}`);
			}

			// Get second pending state
			const pendingState2 = await container.getPendingLocalState();
			store.set("dedup-session2", pendingState2);

			// Verify store performs deduplication
			assert.strictEqual(store.size, 2, "Store should contain 2 sessions");

			// Restore and verify deduplication worked correctly
			const restoredState = store.get("dedup-session2");
			assert(restoredState !== undefined, "Should retrieve dedup-session2 state");

			const restoredContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory: loaderProps.documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: restoredState,
			});

			const restoredTestObj = (await restoredContainer.getEntryPoint()) as ITestFluidObject;
			assert(
				restoredTestObj !== undefined,
				"Expected restored container to have valid entrypoint",
			);

			// Verify final state includes all unique operations
			assert.strictEqual(
				restoredTestObj.root.get("shared-key"),
				"initial-value",
				"Initial shared key should be preserved",
			);

			// Check that we have all the expected keys with their final values
			for (let i = 0; i < 8; i++) {
				const expectedValue = i < 3 ? `op-value-${i}` : `updated-value-${i}`;
				assert.strictEqual(
					restoredTestObj.root.get(`op-key-${i}`),
					expectedValue,
					`Op key ${i} should have correct value after deduplication`,
				);
			}
		});
	});

	describe("store management and cleanup", () => {
		it("should handle store cleanup and memory management", async () => {
			const store = new PendingLocalStateStore<string>();

			// Create container and simulate multiple sessions/snapshots for the same container
			const { container, testFluidObject, urlResolver } = await initializeContainer();

			// Attach to get a consistent URL
			await container.attach(urlResolver.createCreateNewRequest("test-doc"));
			container.disconnect();

			// Simulate multiple offline sessions/snapshots
			for (let i = 0; i < 5; i++) {
				testFluidObject.root.set(`container-${i}-key`, `container-${i}-value`);
				testFluidObject.root.set(`offline-key-${i}`, `offline-value-${i}`);

				const pendingState = await container.getPendingLocalState();
				store.set(`session-${i}`, pendingState);
			}

			assert.strictEqual(store.size, 5, "Store should contain 5 sessions");

			// Test selective cleanup
			store.delete("session-0");
			store.delete("session-1");
			assert.strictEqual(store.size, 3, "Store should contain 3 sessions after deletion");
			assert(!store.has("session-0"), "session-0 should be deleted");
			assert(!store.has("session-1"), "session-1 should be deleted");
			assert(store.has("session-2"), "session-2 should still exist");

			// Test clear
			store.clear();
			assert.strictEqual(store.size, 0, "Store should be empty after clear");
			assert(!store.has("session-2"), "No sessions should exist after clear");

			// Verify iteration on empty store
			const keys = [...store.keys()];
			// Note: store doesn't have values() method, and entries() returns an Iterator not Iterable
			const entriesArray: [string, string][] = [];
			const entriesIterator = store.entries();
			let result = entriesIterator.next();
			while (!result.done) {
				entriesArray.push(result.value);
				result = entriesIterator.next();
			}

			assert.strictEqual(keys.length, 0, "Keys iterator should be empty");
			assert.strictEqual(entriesArray.length, 0, "Entries iterator should be empty");
		});
	});
});
