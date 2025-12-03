/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { PendingLocalStateStore } from "../pendingLocalStateStore.js";
import type {
	IPendingContainerState,
	SerializedSnapshotInfo,
} from "../serializedStateManager.js";

describe("PendingLocalStateStore", () => {
	/**
	 * Creates a mock IPendingContainerState for testing
	 */
	function createMockContainerState(
		url: string,
		savedOps: ISequencedDocumentMessage[] = [],
		snapshotBlobs: Record<string, string> = {},
		loadedGroupIdSnapshots?: Record<string, SerializedSnapshotInfo>,
	): IPendingContainerState {
		const state: IPendingContainerState = {
			attached: true,
			url,
			savedOps,
			snapshotBlobs,
			baseSnapshot: {
				id: "test-snapshot",
				blobs: {},
				trees: {},
			},
			pendingRuntimeState: {},
		};
		if (loadedGroupIdSnapshots !== undefined) {
			state.loadedGroupIdSnapshots = loadedGroupIdSnapshots;
		}
		return state;
	}

	/**
	 * Creates a mock ISequencedDocumentMessage for testing
	 */
	function createMockOp(sequenceNumber: number): ISequencedDocumentMessage {
		return {
			sequenceNumber,
			clientId: "test-client",
			type: "op",
			contents: { type: "test" },
			timestamp: Date.now(),
		} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage;
	}

	/**
	 * Creates a mock SerializedSnapshotInfo for testing
	 */
	function createMockSnapshotInfo(snapshotSequenceNumber: number): SerializedSnapshotInfo {
		return {
			snapshotSequenceNumber,
			baseSnapshot: {
				id: "test-snapshot",
				blobs: {},
				trees: {},
			},
			snapshotBlobs: {},
		};
	}

	/**
	 * Helper to collect iterator results into an array
	 */
	function collectIterator<T>(iterator: Iterator<T>): T[] {
		const results: T[] = [];
		let result = iterator.next();
		while (result.done !== true) {
			results.push(result.value);
			result = iterator.next();
		}
		return results;
	}

	describe("basic Map-like operations", () => {
		it("should start empty", () => {
			const store = new PendingLocalStateStore<string>();
			assert.strictEqual(store.size, 0);
			assert.strictEqual(store.has("test-key"), false);
		});

		it("should store and retrieve values", () => {
			const store = new PendingLocalStateStore<string>();
			const state = createMockContainerState("http://test.com");
			const serializedState = JSON.stringify(state);

			store.set("test-key", serializedState);

			assert.strictEqual(store.size, 1);
			assert.strictEqual(store.has("test-key"), true);
			assert.strictEqual(store.get("test-key"), serializedState);
		});

		it("should delete values", () => {
			const store = new PendingLocalStateStore<string>();
			const state = createMockContainerState("http://test.com");
			const serializedState = JSON.stringify(state);

			store.set("test-key", serializedState);
			assert.strictEqual(store.has("test-key"), true);

			const deleted = store.delete("test-key");
			assert.strictEqual(deleted, true);
			assert.strictEqual(store.has("test-key"), false);
			assert.strictEqual(store.size, 0);
		});

		it("should return false when deleting non-existent key", () => {
			const store = new PendingLocalStateStore<string>();
			const deleted = store.delete("non-existent");
			assert.strictEqual(deleted, false);
		});

		it("should clear all values", () => {
			const store = new PendingLocalStateStore<string>();
			const state1 = createMockContainerState("http://test.com");
			const state2 = createMockContainerState("http://test.com");

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));
			assert.strictEqual(store.size, 2);

			store.clear();
			assert.strictEqual(store.size, 0);
			assert.strictEqual(store.has("key1"), false);
			assert.strictEqual(store.has("key2"), false);
		});

		it("should return undefined for non-existent keys", () => {
			const store = new PendingLocalStateStore<string>();
			assert.strictEqual(store.get("non-existent"), undefined);
		});
	});

	describe("iterator functionality", () => {
		it("should iterate over entries", () => {
			const store = new PendingLocalStateStore<string>();
			const state1 = createMockContainerState("http://test.com");
			const state2 = createMockContainerState("http://test.com");

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			const entries = collectIterator(store.entries());
			assert.strictEqual(entries.length, 2);

			const [key1, value1] = entries[0];
			const [key2, value2] = entries[1];

			assert.strictEqual(key1, "key1");
			assert.strictEqual(value1, JSON.stringify(state1));
			assert.strictEqual(key2, "key2");
			assert.strictEqual(value2, JSON.stringify(state2));
		});

		it("should iterate over keys", () => {
			const store = new PendingLocalStateStore<string>();
			const state = createMockContainerState("http://test.com");

			store.set("key1", JSON.stringify(state));
			store.set("key2", JSON.stringify(state));

			const keys = collectIterator(store.keys());
			assert.deepStrictEqual(keys.sort(), ["key1", "key2"]);
		});

		it("should support Symbol.iterator", () => {
			const store = new PendingLocalStateStore<string>();
			const state1 = createMockContainerState("http://test.com");
			const state2 = createMockContainerState("http://test.com");

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			const entries = collectIterator(store[Symbol.iterator]());
			assert.strictEqual(entries.length, 2);
		});

		it("should handle empty iterator", () => {
			const store = new PendingLocalStateStore<string>();
			const entries = collectIterator(store.entries());
			assert.strictEqual(entries.length, 0);

			const keys = collectIterator(store.keys());
			assert.strictEqual(keys.length, 0);
		});
	});

	describe("URL validation", () => {
		it("should accept first URL", () => {
			const store = new PendingLocalStateStore<string>();
			const state = createMockContainerState("http://test.com");
			const serializedState = JSON.stringify(state);

			// Should not throw
			store.set("key1", serializedState);
			assert.strictEqual(store.size, 1);
		});

		it("should accept multiple states with same URL", () => {
			const store = new PendingLocalStateStore<string>();
			const state1 = createMockContainerState("http://test.com");
			const state2 = createMockContainerState("http://test.com");

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			assert.strictEqual(store.size, 2);
		});

		it("should throw UsageError for different URLs", () => {
			const store = new PendingLocalStateStore<string>();
			const state1 = createMockContainerState("http://test1.com");
			const state2 = createMockContainerState("http://test2.com");

			store.set("key1", JSON.stringify(state1));

			assert.throws(
				() => store.set("key2", JSON.stringify(state2)),
				(error: Error) => {
					return (
						error instanceof UsageError &&
						error.message ===
							"PendingLocalStateStore can only be used with a single container."
					);
				},
				"Expected UsageError for different URLs",
			);
		});
	});

	describe("ops deduplication", () => {
		it("should deduplicate saved ops by sequence number", () => {
			const store = new PendingLocalStateStore<string>();
			const op1 = createMockOp(1);
			const op2 = createMockOp(2);
			const op1Duplicate = { ...createMockOp(1), clientId: "different-client" };

			const state1 = createMockContainerState("http://test.com", [op1, op2]);
			const state2 = createMockContainerState("http://test.com", [op1Duplicate]);

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			// Retrieve and verify that the original op1 is preserved
			const retrievedState2String = store.get("key2");
			assert(retrievedState2String !== undefined, "Expected state to be found");
			const retrievedState2 = JSON.parse(retrievedState2String) as IPendingContainerState;
			assert.strictEqual(retrievedState2.savedOps[0].clientId, "test-client");
			assert.strictEqual(retrievedState2.savedOps[0].sequenceNumber, 1);
		});

		it("should handle ops with different sequence numbers", () => {
			const store = new PendingLocalStateStore<string>();
			const op1 = createMockOp(1);
			const op2 = createMockOp(2);
			const op3 = createMockOp(3);

			const state1 = createMockContainerState("http://test.com", [op1, op2]);
			const state2 = createMockContainerState("http://test.com", [op2, op3]);

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			const retrievedState2String = store.get("key2");
			assert(retrievedState2String !== undefined, "Expected state to be found");
			const retrievedState2 = JSON.parse(retrievedState2String) as IPendingContainerState;
			assert.strictEqual(retrievedState2.savedOps.length, 2);
			assert.strictEqual(retrievedState2.savedOps[0].sequenceNumber, 2);
			assert.strictEqual(retrievedState2.savedOps[1].sequenceNumber, 3);
		});
	});

	describe("blob deduplication", () => {
		it("should deduplicate snapshot blobs by ID", () => {
			const store = new PendingLocalStateStore<string>();
			const blobs1 = { blob1: "content1", blob2: "content2" };
			const blobs2 = { blob1: "different-content", blob3: "content3" };

			const state1 = createMockContainerState("http://test.com", [], blobs1);
			const state2 = createMockContainerState("http://test.com", [], blobs2);

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			// Verify that blob1 keeps the original content from state1
			const retrievedState2String = store.get("key2");
			assert(retrievedState2String !== undefined, "Expected state to be found");
			const retrievedState2 = JSON.parse(retrievedState2String) as IPendingContainerState;
			assert.strictEqual(retrievedState2.snapshotBlobs.blob1, "content1");
			assert.strictEqual(retrievedState2.snapshotBlobs.blob3, "content3");
		});

		it("should handle empty blob objects", () => {
			const store = new PendingLocalStateStore<string>();
			const state1 = createMockContainerState("http://test.com", [], {});
			const state2 = createMockContainerState("http://test.com", [], { blob1: "content1" });

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			const retrievedState2String = store.get("key2");
			assert(retrievedState2String !== undefined, "Expected state to be found");
			const retrievedState2 = JSON.parse(retrievedState2String) as IPendingContainerState;
			assert.strictEqual(retrievedState2.snapshotBlobs.blob1, "content1");
		});
	});

	describe("loading groups deduplication", () => {
		it("should handle undefined loadedGroupIdSnapshots", () => {
			const store = new PendingLocalStateStore<string>();
			const state = createMockContainerState("http://test.com", [], {}, undefined);

			// Should not throw
			store.set("key1", JSON.stringify(state));
			assert.strictEqual(store.size, 1);
		});

		it("should deduplicate loading groups and keep the one with lower sequence number", () => {
			const store = new PendingLocalStateStore<string>();
			const lg1 = createMockSnapshotInfo(10);
			const lg2 = createMockSnapshotInfo(5); // Lower sequence number
			const lg3 = createMockSnapshotInfo(15);

			const state1 = createMockContainerState(
				"http://test.com",
				[],
				{},
				{
					group1: lg1,
					group2: lg3,
				},
			);
			const state2 = createMockContainerState(
				"http://test.com",
				[],
				{},
				{
					group1: lg2, // Should replace lg1 because it has lower sequence number
					group3: lg3,
				},
			);

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			const retrievedState2String = store.get("key2");
			assert(retrievedState2String !== undefined, "Expected state to be found");
			const retrievedState2 = JSON.parse(retrievedState2String) as IPendingContainerState;
			assert(
				retrievedState2.loadedGroupIdSnapshots !== undefined,
				"Expected loading groups to be defined",
			);
			assert.strictEqual(
				retrievedState2.loadedGroupIdSnapshots.group1.snapshotSequenceNumber,
				5,
			);
			assert.strictEqual(
				retrievedState2.loadedGroupIdSnapshots.group3.snapshotSequenceNumber,
				15,
			);
		});

		it("should keep existing loading group if new one has higher sequence number", () => {
			const store = new PendingLocalStateStore<string>();
			const lg1 = createMockSnapshotInfo(5);
			const lg2 = createMockSnapshotInfo(10); // Higher sequence number

			const state1 = createMockContainerState("http://test.com", [], {}, { group1: lg1 });
			const state2 = createMockContainerState("http://test.com", [], {}, { group1: lg2 });

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			const retrievedState2String = store.get("key2");
			assert(retrievedState2String !== undefined, "Expected state to be found");
			const retrievedState2 = JSON.parse(retrievedState2String) as IPendingContainerState;
			assert(
				retrievedState2.loadedGroupIdSnapshots !== undefined,
				"Expected loading groups to be defined",
			);
			// Since state2's loading group has higher sequence number (10 > 5),
			// it should keep its original loading group, not the stored one
			assert.strictEqual(
				retrievedState2.loadedGroupIdSnapshots.group1.snapshotSequenceNumber,
				10,
			);
		});

		it("should handle mixed scenarios with loading groups", () => {
			const store = new PendingLocalStateStore<string>();
			const lg1 = createMockSnapshotInfo(10);
			const lg2 = createMockSnapshotInfo(5);
			const lg3 = createMockSnapshotInfo(15);

			// First state has group1 and group2
			const state1 = createMockContainerState(
				"http://test.com",
				[],
				{},
				{
					group1: lg1,
					group2: lg3,
				},
			);

			// Second state has group1 (lower seq) and group3 (new)
			const state2 = createMockContainerState(
				"http://test.com",
				[],
				{},
				{
					group1: lg2,
					group3: lg3,
				},
			);

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			const retrievedState1String = store.get("key1");
			const retrievedState2String = store.get("key2");
			assert(retrievedState1String !== undefined, "Expected state1 to be found");
			assert(retrievedState2String !== undefined, "Expected state2 to be found");
			const retrievedState1 = JSON.parse(retrievedState1String) as IPendingContainerState;
			const retrievedState2 = JSON.parse(retrievedState2String) as IPendingContainerState;

			assert(
				retrievedState1.loadedGroupIdSnapshots !== undefined,
				"Expected state1 loading groups to be defined",
			);
			assert(
				retrievedState2.loadedGroupIdSnapshots !== undefined,
				"Expected state2 loading groups to be defined",
			);

			// State1's group1 should still be 10 (its original) since it was stored first
			assert.strictEqual(
				retrievedState1.loadedGroupIdSnapshots.group1.snapshotSequenceNumber,
				10,
			);

			// State2's group1 should be 5 since it has lower sequence number and replaced the stored one
			assert.strictEqual(
				retrievedState2.loadedGroupIdSnapshots.group1.snapshotSequenceNumber,
				5,
			);

			// State1 should still have group2
			assert.strictEqual(
				retrievedState1.loadedGroupIdSnapshots.group2.snapshotSequenceNumber,
				15,
			);

			// State2 should have group3
			assert.strictEqual(
				retrievedState2.loadedGroupIdSnapshots.group3.snapshotSequenceNumber,
				15,
			);
		});
	});

	describe("complex integration scenarios", () => {
		it("should handle all deduplication types together", () => {
			const store = new PendingLocalStateStore<string>();
			const op1 = createMockOp(1);
			const op2 = createMockOp(2);
			const op3 = createMockOp(3);

			const blobs1 = { blob1: "content1", blob2: "content2" };
			const blobs2 = { blob1: "different", blob3: "content3" };

			const lg1 = createMockSnapshotInfo(10);
			const lg2 = createMockSnapshotInfo(5);

			const state1 = createMockContainerState("http://test.com", [op1, op2], blobs1, {
				group1: lg1,
			});
			const state2 = createMockContainerState("http://test.com", [op2, op3], blobs2, {
				group1: lg2,
			});

			store.set("key1", JSON.stringify(state1));
			store.set("key2", JSON.stringify(state2));

			const retrievedState2String = store.get("key2");
			assert(retrievedState2String !== undefined, "Expected state to be found");
			const retrievedState2 = JSON.parse(retrievedState2String) as IPendingContainerState;

			// Verify ops deduplication
			assert.strictEqual(retrievedState2.savedOps.length, 2);
			assert.strictEqual(retrievedState2.savedOps[0].sequenceNumber, 2);
			assert.strictEqual(retrievedState2.savedOps[1].sequenceNumber, 3);

			// Verify blob deduplication (blob1 should keep original content)
			assert.strictEqual(retrievedState2.snapshotBlobs.blob1, "content1");
			assert.strictEqual(retrievedState2.snapshotBlobs.blob3, "content3");

			// Verify loading group deduplication (should keep lower sequence number)
			assert(
				retrievedState2.loadedGroupIdSnapshots !== undefined,
				"Expected loading groups to be defined",
			);
			assert.strictEqual(
				retrievedState2.loadedGroupIdSnapshots.group1.snapshotSequenceNumber,
				5,
			);
		});

		it("should handle overwriting existing keys", () => {
			const store = new PendingLocalStateStore<string>();
			const state1 = createMockContainerState("http://test.com", [createMockOp(1)]);
			const state2 = createMockContainerState("http://test.com", [createMockOp(2)]);

			store.set("key1", JSON.stringify(state1));
			assert.strictEqual(store.size, 1);

			// Overwrite the same key
			store.set("key1", JSON.stringify(state2));
			assert.strictEqual(store.size, 1);

			const retrievedString = store.get("key1");
			assert(retrievedString !== undefined, "Expected state to be found");
			const retrieved = JSON.parse(retrievedString) as IPendingContainerState;
			assert.strictEqual(retrieved.savedOps[0].sequenceNumber, 2);
		});
	});

	describe("edge cases", () => {
		it("should handle malformed JSON gracefully", () => {
			const store = new PendingLocalStateStore<string>();
			// This test verifies that the store relies on the getAttachedContainerStateFromSerializedContainer
			// function to parse JSON, so malformed JSON should throw during set()
			assert.throws(() => {
				store.set("key1", "invalid-json");
			}, SyntaxError);
		});

		it("should work with different key types", () => {
			const numericStore = new PendingLocalStateStore<number>();
			const state = createMockContainerState("http://test.com");

			numericStore.set(123, JSON.stringify(state));
			assert.strictEqual(numericStore.has(123), true);
			assert.strictEqual(numericStore.get(123), JSON.stringify(state));
		});
	});
});
