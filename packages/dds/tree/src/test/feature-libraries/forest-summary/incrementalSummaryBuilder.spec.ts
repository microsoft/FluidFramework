/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import {
	SummaryTreeBuilder,
	type ReadAndParseBlob,
} from "@fluidframework/runtime-utils/internal";
// import { SummaryType } from "@fluidframework/driver-definitions";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { SummaryType, type ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	ForestIncrementalSummaryBuilder,
	ForestSummaryTrackingState,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/forest-summary/incrementalSummaryBuilder.js";
import type {
	EncodedFieldBatch,
	ChunkReferenceId,
	TreeChunk,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/index.js";

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
	blobs: Map<string, string> = new Map(),
): IChannelStorageService {
	const mockService: Partial<IChannelStorageService> = {
		getSnapshotTree: snapshotTree ? () => snapshotTree : undefined,
		contains: async (path: string) => blobs.has(path),
		readBlob: async (path: string) => {
			const blobContents = blobs.get(path);
			if (blobContents === undefined) {
				throw new Error(`Blob not found: ${path}`);
			}
			return stringToBuffer(blobContents, "utf8"); // Mock implementation
		},
		list: async () => [],
	};
	return mockService as IChannelStorageService;
}

function getReadAndParse(blobMap: Map<string, string>): ReadAndParseBlob {
	return async <T>(id: string): Promise<T> => {
		const blob = blobMap.get(id);
		if (blob === undefined) {
			throw new Error(`Blob not found: ${id}`);
		}
		return blob as T;
	};
}

describe("ForestIncrementalSummaryBuilder", () => {
	let builder: ForestIncrementalSummaryBuilder;
	let testChunk: TreeChunk;

	beforeEach(() => {
		builder = new ForestIncrementalSummaryBuilder();
		testChunk = {} as unknown as TreeChunk; // Mock chunk for testing
	});

	describe("startingSummary", () => {
		let summaryBuilder: SummaryTreeBuilder;
		beforeEach(() => {
			summaryBuilder = new SummaryTreeBuilder();
		});

		it("returns ShouldSummarizeIncrementally=false when incrementalSummaryContext is undefined", () => {
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to be ReadyToTrack",
			);

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
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to remain ReadyToTrack",
			);
		});

		it("returns ShouldSummarizeIncrementally=true when incrementalSummaryContext is provided", () => {
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to be ReadyToTrack",
			);
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
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.Tracking,
				"Expected forestSummaryState to change to Tracking",
			);
		});

		it("returns ShouldSummarizeIncrementally=true when fullTree is true", () => {
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to be ReadyToTrack",
			);
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
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.Tracking,
				"Expected forestSummaryState to change to Tracking",
			);
		});

		it("throws when called while already tracking", () => {
			const incrementalSummaryContext = createMockIncrementalSummaryContext(100, 90);

			// Start tracking first summary
			builder.startingSummary(summaryBuilder, false /* fullTree */, incrementalSummaryContext);
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.Tracking,
				"Expected forestSummaryState to be Tracking",
			);

			// Attempting to start another should throw
			assert.throws(
				() => builder.startingSummary(summaryBuilder, false, incrementalSummaryContext),
				"calling startingSummary while already tracking should throw",
			);
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.Tracking,
				"Expected forestSummaryState to remain Tracking after failed start",
			);
		});
	});

	describe("completedSummary", () => {
		it("does nothing when incrementalSummaryContext is undefined", () => {
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to be ReadyToTrack",
			);
			assert.doesNotThrow(
				() => builder.completedSummary(undefined),
				"Completed summary with undefined context should not throw",
			);
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to remain ReadyToTrack",
			);
		});

		it("throws when not tracking summary", () => {
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to be ReadyToTrack",
			);
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			assert.throws(
				() => builder.completedSummary(incrementalSummaryContext),
				"Calling completedSummary without starting should throw",
			);
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to remain ReadyToTrack after failed completion",
			);
		});

		it("clears tracking state when called after starting summary", () => {
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to be ReadyToTrack",
			);
			const summaryBuilder = new SummaryTreeBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			builder.startingSummary(summaryBuilder, false /* fullTree */, incrementalSummaryContext);
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.Tracking,
				"Expected forestSummaryState to change to Tracking",
			);
			assert.doesNotThrow(
				() => builder.completedSummary(incrementalSummaryContext),
				"Calling completedSummary after starting should be successful",
			);
			assert.strictEqual(
				builder.forestSummaryState,
				ForestSummaryTrackingState.ReadyToTrack,
				"Expected forestSummaryState to be back to ReadyToTrack",
			);
		});
	});

	describe("load", () => {
		it("returns early when snapshot tree is not available", async () => {
			const storageService = createMockStorageService(); // No snapshot tree
			await builder.load(storageService, getReadAndParse(new Map()));
		});

		it("loads chunk contents from snapshot tree", async () => {
			const blobMap = new Map([
				["0/contents", "chunk0"],
				["1/contents", "chunk1"],
			]);
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					"0": {
						trees: {},
						blobs: {
							contents: blobMap.get("0/contents") ?? "",
						},
					},
					"1": {
						trees: {},
						blobs: {
							contents: blobMap.get("1/contents") ?? "",
						},
					},
				},
				blobs: {},
			};
			const storageService = createMockStorageService(mockSnapshotTree, blobMap);

			await builder.load(storageService, getReadAndParse(blobMap));

			// Verify chunks can be retrieved
			const chunk0 = builder.getEncodedIncrementalChunk(0 as ChunkReferenceId);
			const chunk1 = builder.getEncodedIncrementalChunk(1 as ChunkReferenceId);

			assert.deepStrictEqual(
				chunk0,
				blobMap.get("0/contents"),
				"Chunk 0 should match stored contents",
			);
			assert.deepStrictEqual(
				chunk1,
				blobMap.get("1/contents"),
				"Chunk 1 should match stored contents",
			);
		});

		it("loads nested chunk trees recursively", async () => {
			const blobMap = new Map([
				["0/contents", "chunk0"],
				["0/1/contents", "chunk1"],
			]);
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					"0": {
						trees: {
							"1": {
								trees: {},
								blobs: {
									contents: blobMap.get("0/1/contents") ?? "",
								},
							},
						},
						blobs: {
							contents: blobMap.get("0/contents") ?? "",
						},
					},
				},
				blobs: {},
			};
			const storageService = createMockStorageService(mockSnapshotTree, blobMap);
			await builder.load(storageService, getReadAndParse(blobMap));

			// Verify both parent and nested chunks can be retrieved
			const parentChunk = builder.getEncodedIncrementalChunk(0 as ChunkReferenceId);
			const nestedChunk = builder.getEncodedIncrementalChunk(1 as ChunkReferenceId);

			assert.deepStrictEqual(parentChunk, blobMap.get("0/contents"));
			assert.deepStrictEqual(nestedChunk, blobMap.get("0/1/contents"));
		});

		it("throws when chunk contents are missing", async () => {
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					"0": {
						trees: {},
						blobs: {},
					},
				},
				blobs: {},
			};
			const storageService = createMockStorageService(mockSnapshotTree, new Map());
			await assert.rejects(
				async () => builder.load(storageService, getReadAndParse(new Map())),
				(error: Error) => {
					assert(error.message.includes("Cannot find contents for incremental chunk"));
					return true;
				},
				"Expected error when chunk contents are missing",
			);
		});
	});

	describe("encodeIncrementalChunk", () => {
		const mockEncodedChunk = {} as unknown as EncodedFieldBatch;
		it("throws when not tracking summary", () => {
			assert.throws(
				() => builder.encodeIncrementalChunk(testChunk, () => mockEncodedChunk),
				(error: Error) =>
					validateAssertionError(error, "Summary tracking must be in progress"),
			);
		});

		it("encodes chunk and returns reference ID when tracking", () => {
			const summaryBuilder = new SummaryTreeBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			builder.startingSummary(summaryBuilder, false /* fullTree */, incrementalSummaryContext);
			const referenceId = builder.encodeIncrementalChunk(testChunk, () => mockEncodedChunk);
			assert.strictEqual(typeof referenceId, "number", "Reference ID should be a number");
		});

		it("always encodes chunks in full tree mode", () => {
			const summaryBuilder = new SummaryTreeBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			// Start with non full tree mode
			builder.startingSummary(summaryBuilder, false /* fullTree */, incrementalSummaryContext);
			const referenceId1 = builder.encodeIncrementalChunk(testChunk, () => mockEncodedChunk);
			// Complete first summary
			builder.completedSummary(incrementalSummaryContext);

			// Start new summary - full tree.
			const newIncrementalSummaryContext = createMockIncrementalSummaryContext(20, 10);
			builder.startingSummary(
				summaryBuilder,
				true /* fullTree */,
				newIncrementalSummaryContext,
			);
			// Should still encode (not use handle) because it's full tree mode
			const referenceId2 = builder.encodeIncrementalChunk(testChunk, () => mockEncodedChunk);
			// Should get different reference IDs because both were encoded
			assert.notStrictEqual(referenceId1, referenceId2, "Reference IDs should be different");
		});

		it("creates summary handles for unchanged chunks", () => {
			const summaryBuilder = new SummaryTreeBuilder();
			const incrementalSummaryContext1 = createMockIncrementalSummaryContext(
				10,
				0,
				"/base/path",
			);
			// First summary
			builder.startingSummary(
				summaryBuilder,
				false /* fullTree */,
				incrementalSummaryContext1,
			);
			const referenceId1 = builder.encodeIncrementalChunk(testChunk, () => mockEncodedChunk);
			builder.completedSummary(incrementalSummaryContext1);

			// Second summary with same chunk
			const summaryBuilder2 = new SummaryTreeBuilder();
			const incrementalSummaryContext2 = createMockIncrementalSummaryContext(
				20,
				10,
				"/base/path",
			);
			builder.startingSummary(summaryBuilder2, false, incrementalSummaryContext2);
			const referenceId2 = builder.encodeIncrementalChunk(testChunk, () => mockEncodedChunk);
			// Should reuse the same reference ID
			assert.strictEqual(referenceId1, referenceId2, "Reference IDs should match");

			// Verify that a handle was added to the summary builder
			const summary = summaryBuilder2.getSummaryTree();
			const summaryEntry = summary.summary.tree[`${referenceId1}`];
			assert.strictEqual(
				summaryEntry?.type,
				SummaryType.Handle,
				"Expected summary entry to be a handle",
			);
		});

		it("creates summary handles for unchanged chunks even if previous summary failed", () => {
			const summaryBuilder1 = new SummaryTreeBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			// First summary
			builder.startingSummary(
				summaryBuilder1,
				false /* fullTree */,
				incrementalSummaryContext,
			);
			const referenceId1 = builder.encodeIncrementalChunk(testChunk, () => mockEncodedChunk);
			builder.completedSummary(incrementalSummaryContext);

			// Start new summary and don't encode any chunks.
			const incrementalSummaryContext2 = createMockIncrementalSummaryContext(20, 10);
			builder.startingSummary(
				summaryBuilder1,
				false /* fullTree */,
				incrementalSummaryContext2,
			);
			builder.completedSummary(incrementalSummaryContext2);

			// Now start a new summary and use the first summary's sequence number as the latestSummarySequenceNumber
			// to simulate a failure of the previous summary.
			const summaryBuilder2 = new SummaryTreeBuilder();
			const incrementalSummaryContext3 = createMockIncrementalSummaryContext(30, 10);
			builder.startingSummary(
				summaryBuilder2,
				false /* fullTree */,
				incrementalSummaryContext3,
			);

			// Should reuse the same reference ID since the chunk hasn't changed since the last successful summary.
			const referenceId2 = builder.encodeIncrementalChunk(testChunk, () => mockEncodedChunk);
			assert.strictEqual(referenceId1, referenceId2, "Reference IDs should match");

			// Verify that a handle was added to the summary builder
			const summary = summaryBuilder2.getSummaryTree();
			const summaryEntry = summary.summary.tree[`${referenceId1}`];
			assert.strictEqual(
				summaryEntry?.type,
				SummaryType.Handle,
				"Expected summary entry to be a handle",
			);
		});
	});

	describe("getEncodedIncrementalChunk", () => {
		it("returns encoded chunk when it exists", async () => {
			const blobMap = new Map([["0/contents", "chunk0"]]);
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					"0": {
						trees: {},
						blobs: {
							contents: blobMap.get("0/contents") ?? "",
						},
					},
				},
				blobs: {},
			};

			const storageService = createMockStorageService(mockSnapshotTree, blobMap);
			await builder.load(storageService, getReadAndParse(blobMap));

			const result = builder.getEncodedIncrementalChunk(0 as ChunkReferenceId);
			assert.deepStrictEqual(
				result,
				blobMap.get("0/contents"),
				"Should return correct chunk contents",
			);
		});

		it("throws when encoded chunk does not exist", () => {
			assert.throws(
				() => builder.getEncodedIncrementalChunk(999 as ChunkReferenceId),
				(error: Error) => {
					assert(error.message.includes("not found"));
					return true;
				},
			);
		});
	});
});
