/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
// import { SummaryType } from "@fluidframework/driver-definitions";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import {
	ForestIncrementalSummaryBuilder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/forest-summary/incrementalSummaryBuilder.js";

// Using brand types to create mock types for testing
type ChunkReferenceId = number & { __brand: "ChunkReferenceId" };

// Use the simplest mock that satisfies the encoder function contract
function createMockEncodedBatch(): unknown {
	return {
		version: 1,
		identifiers: [],
		data: [],
		shapes: [],
	};
}

/**
 * Type-safe cast for tree chunks in tests
 */
interface TreeChunkLike {
	// Minimal interface that the builder expects
}

/**
 * Minimal mock TreeChunk for testing, avoiding import restrictions.
 */
class MockTreeChunk {
	private referenceCount = 1;

	public constructor(
		public readonly topLevelLength: number,
		public readonly fields: Map<string, unknown>,
	) {}

	public referenceAdded(): void {
		this.referenceCount++;
	}

	public referenceRemoved(): void {
		this.referenceCount--;
	}

	// Mock implementation of TreeChunk interface
	public get cursor(): unknown {
		return {};
	}

	public readonly isShared = false;
}

/**
 * Creates a mock incremental summary context for testing.
 */
function createMockIncrementalSummaryContext(
	summarySequenceNumber: number,
	latestSummarySequenceNumber: number,
	summaryPath: string = "/test/path",
): IExperimentalIncrementalSummaryContext {
	return {
		summarySequenceNumber,
		latestSummarySequenceNumber,
		summaryPath,
	};
}

/**
 * Creates a mock channel storage service for testing.
 */
function createMockStorageService(
	snapshotTree?: ISnapshotTree,
	blobs: Map<string, unknown> = new Map(),
): IChannelStorageService {
	const mockService: Partial<IChannelStorageService> = {
		getSnapshotTree: snapshotTree ? () => snapshotTree : undefined,
		contains: async (path: string) => blobs.has(path),
		readBlob: async (path: string) => {
			const blob = blobs.get(path);
			if (blob === undefined) {
				throw new Error(`Blob not found: ${path}`);
			}
			return new ArrayBuffer(0); // Mock implementation
		},
		list: async () => [],
	};
	return mockService as IChannelStorageService;
}

/**
 * Mock read and parse function for testing.
 */
async function mockReadAndParse<T>(path: string): Promise<T> {
	// Simple mock implementation - in real tests this would read from storage
	const mockData = { mockData: `data for ${path}` } as unknown as T;
	return mockData;
}

describe("ForestIncrementalSummaryBuilder", () => {
	let builder: ForestIncrementalSummaryBuilder;
	let mockChunk1: MockTreeChunk;
	let mockChunk2: MockTreeChunk;

	beforeEach(() => {
		builder = new ForestIncrementalSummaryBuilder();
		// Create simple MockTreeChunk instances for testing
		mockChunk1 = new MockTreeChunk(1, new Map());
		mockChunk2 = new MockTreeChunk(2, new Map());
	});

	afterEach(() => {
		// Clean up references
		mockChunk1.referenceRemoved();
		mockChunk2.referenceRemoved();
	});

	describe("startingSummary", () => {
		let summaryBuilder: SummaryTreeBuilder;
		beforeEach(() => {
			summaryBuilder = new SummaryTreeBuilder();
		});

		it("returns ShouldSummarizeIncrementally=false when incrementalSummaryContext is undefined", () => {
			const shouldSummarizeIncrementally = builder.startingSummary(
				summaryBuilder,
				false /* fullTree */,
				undefined /* incrementalSummaryContext */,
			);
			assert.strictEqual(
				shouldSummarizeIncrementally,
				false,
				"Expected ShouldSummarizeIncrementally to be false when context is undefined",
			);
		});

		it("returns ShouldSummarizeIncrementally=true when incrementalSummaryContext is provided", () => {
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			const shouldSummarizeIncrementally = builder.startingSummary(
				summaryBuilder,
				false /* fullTree */,
				incrementalSummaryContext,
			);
			assert.strictEqual(
				shouldSummarizeIncrementally,
				true,
				"Expected ShouldSummarizeIncrementally to be true when context is provided",
			);
		});

		it("returns ShouldSummarizeIncrementally=true when fullTree is true", () => {
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			const shouldSummarizeIncrementally = builder.startingSummary(
				summaryBuilder,
				true /* fullTree */,
				incrementalSummaryContext,
			);
			assert.strictEqual(
				shouldSummarizeIncrementally,
				true,
				"Expected ShouldSummarizeIncrementally to be true when fullTree is true",
			);
		});

		it("throws when called while already tracking", () => {
			const incrementalSummaryContext = createMockIncrementalSummaryContext(100, 90);

			// Start tracking first summary
			builder.startingSummary(summaryBuilder, false /* fullTree */, incrementalSummaryContext);

			// Attempting to start another should throw
			assert.throws(
				() => builder.startingSummary(summaryBuilder, false, incrementalSummaryContext),
				"Starting summary while already tracking should throw",
			);
		});
	});

	describe("encodeIncrementalChunk", () => {
		// 	it("throws when not tracking summary", () => {
		// 		assert.throws(
		// 			() =>
		// 				builder.encodeIncrementalChunk(mockChunk1 as unknown as TreeChunk, () =>
		// 					createMockEncodedBatch(),
		// 				),
		// 			(error: Error) =>
		// 				validateAssertionError(error, "Summary tracking must be in progress"),
		// 		);
		// 	});
		// 	it("encodes chunk and returns reference ID when tracking", () => {
		// 		const summaryBuilder = new SummaryTreeBuilder();
		// 		const context = createMockIncrementalSummaryContext(100, 90);
		// 		builder.startingSummary(summaryBuilder, false, context);
		// 		const referenceId = builder.encodeIncrementalChunk(
		// 			mockChunk1 as unknown as TreeChunk,
		// 			() => createMockEncodedBatch(),
		// 		);
		// 		assert.strictEqual(typeof referenceId, "number");
		// 		assert.strictEqual(referenceId, 0); // First chunk should get ID 0
		// 	});
		// 	it("generates sequential reference IDs for multiple chunks", () => {
		// 		const summaryBuilder = new SummaryTreeBuilder();
		// 		const context = createMockIncrementalSummaryContext(100, 90);
		// 		builder.startingSummary(summaryBuilder, false, context);
		// 		const referenceId1 = builder.encodeIncrementalChunk(
		// 			mockChunk1 as unknown as TreeChunk,
		// 			() => createMockEncodedBatch(),
		// 		);
		// 		const referenceId2 = builder.encodeIncrementalChunk(
		// 			mockChunk2 as unknown as TreeChunk,
		// 			() => createMockEncodedBatch(),
		// 		);
		// 		assert.strictEqual(referenceId1, 0);
		// 		assert.strictEqual(referenceId2, 1);
		// 	});
		// 	it("always encodes chunks in full tree mode", () => {
		// 		const summaryBuilder = new SummaryTreeBuilder();
		// 		const context = createMockIncrementalSummaryContext(100, 90);
		// 		// Start with full tree mode
		// 		builder.startingSummary(summaryBuilder, true, context);
		// 		// Encode the same chunk twice
		// 		const referenceId1 = builder.encodeIncrementalChunk(
		// 			mockChunk1 as unknown as TreeChunk,
		// 			() => createMockEncodedBatch(),
		// 		);
		// 		// Complete first summary
		// 		builder.completedSummary(context);
		// 		// Start new summary (not full tree)
		// 		const newContext = createMockIncrementalSummaryContext(101, 100);
		// 		builder.startingSummary(summaryBuilder, true, newContext);
		// 		// Should still encode (not use handle) because it's full tree mode
		// 		const referenceId2 = builder.encodeIncrementalChunk(
		// 			mockChunk1 as unknown as TreeChunk,
		// 			() => createMockEncodedBatch(),
		// 		);
		// 		// Should get different reference IDs because both were encoded
		// 		assert.notStrictEqual(referenceId1, referenceId2);
		// 	});
		// 	it("creates summary handles for unchanged chunks in incremental mode", () => {
		// 		const summaryBuilder = new SummaryTreeBuilder();
		// 		const context1 = createMockIncrementalSummaryContext(100, 90, "/base/path");
		// 		// First summary
		// 		builder.startingSummary(summaryBuilder, false, context1);
		// 		const referenceId1 = builder.encodeIncrementalChunk(
		// 			mockChunk1 as unknown as TreeChunk,
		// 			() => createMockEncodedBatch(),
		// 		);
		// 		builder.completedSummary(context1);
		// 		// Second summary with same chunk
		// 		const summaryBuilder2 = new SummaryTreeBuilder();
		// 		const context2 = createMockIncrementalSummaryContext(101, 100, "/base/path");
		// 		builder.startingSummary(summaryBuilder2, false, context2);
		// 		const referenceId2 = builder.encodeIncrementalChunk(
		// 			mockChunk1 as unknown as TreeChunk,
		// 			() => createMockEncodedBatch(),
		// 		);
		// 		// Should reuse the same reference ID
		// 		assert.strictEqual(referenceId1, referenceId2);
		// 		// Verify that a handle was added to the summary builder
		// 		const summary = summaryBuilder2.getSummaryTree();
		// 		const summaryEntry = summary.summary.tree["0"];
		// 		assert(summaryEntry !== undefined);
		// 		assert.strictEqual(summaryEntry.type, SummaryType.Handle);
		// 	});
		// });
		// describe("completedSummary", () => {
		// 	it("does nothing when incrementalSummaryContext is undefined", () => {
		// 		// Should not throw
		// 		builder.completedSummary(undefined);
		// 	});
		// 	it("throws when not tracking summary", () => {
		// 		const context = createMockIncrementalSummaryContext(100, 90);
		// 		assert.throws(
		// 			() => builder.completedSummary(context),
		// 			(error: Error) =>
		// 				validateAssertionError(error, "Summary tracking must be in progress"),
		// 		);
		// 	});
		// 	it("clears tracking state when called after starting summary", () => {
		// 		const summaryBuilder = new SummaryTreeBuilder();
		// 		const context = createMockIncrementalSummaryContext(100, 90);
		// 		builder.startingSummary(summaryBuilder, false, context);
		// 		builder.completedSummary(context);
		// 		// Should now be able to start a new summary
		// 		const newContext = createMockIncrementalSummaryContext(101, 100);
		// 		const result = builder.startingSummary(summaryBuilder, false, newContext);
		// 		assert.strictEqual(result, true);
		// 	});
		// 	it("cleans up old tracking data", () => {
		// 		const summaryBuilder = new SummaryTreeBuilder();
		// 		// Create multiple summaries with different sequence numbers
		// 		const context1 = createMockIncrementalSummaryContext(100, 80);
		// 		builder.startingSummary(summaryBuilder, false, context1);
		// 		builder.encodeIncrementalChunk(mockChunk1 as TreeChunkLike, () =>
		// 			createMockEncodedBatch(),
		// 		);
		// 		builder.completedSummary(context1);
		// 		const context2 = createMockIncrementalSummaryContext(110, 100);
		// 		builder.startingSummary(summaryBuilder, false, context2);
		// 		builder.encodeIncrementalChunk(mockChunk2 as TreeChunkLike, () =>
		// 			createMockEncodedBatch(),
		// 		);
		// 		builder.completedSummary(context2);
		// 		// Data for sequence 100 should be cleaned up since latest is now 100
		// 		// (This is internal state, so we test indirectly by ensuring new chunks get fresh IDs)
		// 		const context3 = createMockIncrementalSummaryContext(120, 110);
		// 		builder.startingSummary(summaryBuilder, false, context3);
		// 		// Chunk1 should not be found from old tracking data (sequence 100 < 110)
		// 		// so it should get a new encoding rather than a handle
		// 		const referenceId = builder.encodeIncrementalChunk(mockChunk1 as TreeChunkLike, () =>
		// 			createMockEncodedBatch(),
		// 		);
		// 		assert.strictEqual(typeof referenceId, "number");
		// 	});
	});

	describe("load", () => {
		it("returns early when snapshot tree is not available", async () => {
			const storageService = createMockStorageService(); // No snapshot tree
			await builder.load(storageService, mockReadAndParse);
			// Should not throw and should complete successfully
		});

		it("loads chunk contents from snapshot tree", async () => {
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					"0": {
						trees: {},
						blobs: {
							contents: "blob-id-1",
						},
					},
					"1": {
						trees: {},
						blobs: {
							contents: "blob-id-2",
						},
					},
				},
				blobs: {},
			};

			const blobMap = new Map([
				["0/contents", { mockChunkData: "chunk0" }],
				["1/contents", { mockChunkData: "chunk1" }],
			]);

			const storageService = createMockStorageService(mockSnapshotTree, blobMap);

			const readAndParse = async <T>(path: string): Promise<T> => {
				const blob = blobMap.get(path);
				if (!blob) {
					throw new Error(`Blob not found: ${path}`);
				}
				return blob as T;
			};

			await builder.load(storageService, readAndParse);

			// Verify chunks can be retrieved
			const chunk0 = builder.getEncodedIncrementalChunk(0 as ChunkReferenceId);
			const chunk1 = builder.getEncodedIncrementalChunk(1 as ChunkReferenceId);

			assert.deepStrictEqual(chunk0, { mockChunkData: "chunk0" });
			assert.deepStrictEqual(chunk1, { mockChunkData: "chunk1" });
		});

		it("loads nested chunk trees recursively", async () => {
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					"0": {
						trees: {
							"1": {
								trees: {},
								blobs: {
									contents: "nested-blob-id",
								},
							},
						},
						blobs: {
							contents: "parent-blob-id",
						},
					},
				},
				blobs: {},
			};

			const blobMap = new Map([
				["0/contents", { parentChunk: "data" }],
				["0/1/contents", { nestedChunk: "data" }],
			]);

			const storageService = createMockStorageService(mockSnapshotTree, blobMap);

			const readAndParse = async <T>(path: string): Promise<T> => {
				const blob = blobMap.get(path);
				if (!blob) {
					throw new Error(`Blob not found: ${path}`);
				}
				return blob as T;
			};

			await builder.load(storageService, readAndParse);

			// Verify both parent and nested chunks can be retrieved
			const parentChunk = builder.getEncodedIncrementalChunk(0 as ChunkReferenceId);
			const nestedChunk = builder.getEncodedIncrementalChunk(1 as ChunkReferenceId);

			assert.deepStrictEqual(parentChunk, { parentChunk: "data" });
			assert.deepStrictEqual(nestedChunk, { nestedChunk: "data" });
		});

		it("throws when chunk contents are missing", async () => {
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					"0": {
						trees: {},
						blobs: {
							contents: "missing-blob-id",
						},
					},
				},
				blobs: {},
			};

			const storageService = createMockStorageService(mockSnapshotTree, new Map());

			await assert.rejects(
				async () => builder.load(storageService, mockReadAndParse),
				(error: Error) => {
					assert(error.message.includes("Cannot find contents for incremental chunk"));
					return true;
				},
			);
		});
	});

	describe("getEncodedIncrementalChunk", () => {
		it("returns encoded chunk when it exists", async () => {
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					"42": {
						trees: {},
						blobs: {
							contents: "test-blob-id",
						},
					},
				},
				blobs: {},
			};

			const expectedData = { testChunk: "data" };
			const blobMap = new Map([["42/contents", expectedData]]);

			const storageService = createMockStorageService(mockSnapshotTree, blobMap);

			const readAndParse = async <T>(path: string): Promise<T> => {
				const blob = blobMap.get(path);
				if (!blob) {
					throw new Error(`Blob not found: ${path}`);
				}
				return blob as T;
			};

			await builder.load(storageService, readAndParse);

			const result = builder.getEncodedIncrementalChunk(42 as ChunkReferenceId);
			assert.deepStrictEqual(result, expectedData);
		});

		it("throws when chunk does not exist", () => {
			assert.throws(
				() => builder.getEncodedIncrementalChunk(999 as ChunkReferenceId),
				(error: Error) => {
					assert(error.message.includes("Chunk with reference ID 999 not found"));
					return true;
				},
			);
		});
	});

	// describe("Integration scenarios", () => {
	// 	it("supports complete summary workflow", () => {
	// 		const summaryBuilder = new SummaryTreeBuilder();
	// 		const context = createMockIncrementalSummaryContext(100, 90);

	// 		// Start summary
	// 		const shouldSummarizeIncrementally = builder.startingSummary(
	// 			summaryBuilder,
	// 			false,
	// 			context,
	// 		);
	// 		assert.strictEqual(shouldSummarizeIncrementally, true);

	// 		// Encode some chunks
	// 		const ref1 = builder.encodeIncrementalChunk(mockChunk1 as any, () => mockEncodedBatch);
	// 		const ref2 = builder.encodeIncrementalChunk(mockChunk2 as any, () => mockEncodedBatch);

	// 		assert.strictEqual(ref1, 0);
	// 		assert.strictEqual(ref2, 1);

	// 		// Complete summary
	// 		builder.completedSummary(context);

	// 		// Verify we can start a new summary
	// 		const newContext = createMockIncrementalSummaryContext(101, 100);
	// 		const newResult = builder.startingSummary(summaryBuilder, false, newContext);
	// 		assert.strictEqual(newResult, true);
	// 	});

	// 	it("handles summary handles correctly across multiple summaries", () => {
	// 		let summaryBuilder = new SummaryTreeBuilder();
	// 		const context1 = createMockIncrementalSummaryContext(100, 90, "/base");

	// 		// First summary - encode chunks
	// 		builder.startingSummary(summaryBuilder, false, context1);
	// 		const ref1 = builder.encodeIncrementalChunk(mockChunk1 as any, () => mockEncodedBatch);
	// 		const ref2 = builder.encodeIncrementalChunk(mockChunk2 as any, () => mockEncodedBatch);
	// 		builder.completedSummary(context1);

	// 		// Second summary - same chunks should use handles
	// 		summaryBuilder = new SummaryTreeBuilder();
	// 		const context2 = createMockIncrementalSummaryContext(101, 100, "/base");
	// 		builder.startingSummary(summaryBuilder, false, context2);

	// 		const ref1_v2 = builder.encodeIncrementalChunk(
	// 			mockChunk1 as any,
	// 			() => mockEncodedBatch,
	// 		);
	// 		const ref2_v2 = builder.encodeIncrementalChunk(
	// 			mockChunk2 as any,
	// 			() => mockEncodedBatch,
	// 		);

	// 		// Should reuse reference IDs
	// 		assert.strictEqual(ref1, ref1_v2);
	// 		assert.strictEqual(ref2, ref2_v2);

	// 		// Summary should contain handles
	// 		const summary = summaryBuilder.getSummaryTree();
	// 		const ref1Entry = summary.summary.tree[ref1.toString()];
	// 		const ref2Entry = summary.summary.tree[ref2.toString()];

	// 		assert(ref1Entry !== undefined);
	// 		assert(ref2Entry !== undefined);
	// 		assert.strictEqual(ref1Entry.type, SummaryType.Handle);
	// 		assert.strictEqual(ref2Entry.type, SummaryType.Handle);

	// 		builder.completedSummary(context2);
	// 	});
	// });
});
