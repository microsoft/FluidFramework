/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
// import { SummaryType } from "@fluidframework/driver-definitions";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { SummaryType, type ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	ForestIncrementalSummaryBehavior,
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
import type {
	FieldKey,
	ITreeCursorSynchronous,
	TreeNodeSchemaIdentifier,
} from "../../../core/index.js";
import type { JsonCompatible } from "../../../util/index.js";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

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

function getReadAndParseChunk<T extends JsonCompatible<IFluidHandle>>(
	chunkMap: Map<string, string>,
): (id: string) => Promise<T> {
	return async (id: string): Promise<T> => {
		const blob = chunkMap.get(id);
		if (blob === undefined) {
			throw new Error(`Blob not found: ${id}`);
		}
		return blob as T;
	};
}

const testChunk = {} as unknown as TreeChunk;
const testCursor = { getFieldLength: () => 1 } as unknown as ITreeCursorSynchronous;

describe("ForestIncrementalSummaryBuilder", () => {
	function createIncrementalSummaryBuilder() {
		return new ForestIncrementalSummaryBuilder(
			true /* enableIncrementalSummary */,
			(cursor: ITreeCursorSynchronous) => {
				return testChunk;
			},
			(nodeIdentifier: TreeNodeSchemaIdentifier, fieldKey: FieldKey) => false,
		);
	}

	describe("startingSummary", () => {
		it("returns ForestIncrementalSummaryBehavior.SingleBlob when incrementalSummaryContext is undefined", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);

			const incrementalSummaryBehavior = builder.startingSummary(
				new SummaryTreeBuilder(),
				false /* fullTree */,
				undefined /* incrementalSummaryContext */,
			);

			assert.equal(incrementalSummaryBehavior, ForestIncrementalSummaryBehavior.SingleBlob);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
		});

		it("returns ForestIncrementalSummaryBehavior.Incremental when incrementalSummaryContext is defined", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			const incrementalSummaryBehavior = builder.startingSummary(
				new SummaryTreeBuilder(),
				false /* fullTree */,
				incrementalSummaryContext,
			);
			assert.equal(incrementalSummaryBehavior, ForestIncrementalSummaryBehavior.Incremental);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);
		});

		it("returns ForestIncrementalSummaryBehavior.Incremental when fullTree is true", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			const incrementalSummaryBehavior = builder.startingSummary(
				new SummaryTreeBuilder(),
				true /* fullTree */,
				incrementalSummaryContext,
			);
			assert.equal(incrementalSummaryBehavior, ForestIncrementalSummaryBehavior.Incremental);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);
		});

		it("throws when called while already tracking", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(100, 90);

			// Start tracking first summary
			builder.startingSummary(
				new SummaryTreeBuilder(),
				false /* fullTree */,
				incrementalSummaryContext,
			);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);

			// Attempting to start another should throw
			assert.throws(
				() =>
					builder.startingSummary(new SummaryTreeBuilder(), false, incrementalSummaryContext),
				(error: Error) => validateAssertionError(error, /Already tracking/),
			);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);
		});
	});

	describe("completedSummary", () => {
		it("does nothing when incrementalSummaryContext is undefined", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			assert.doesNotThrow(
				() => builder.completedSummary(undefined),
				"Completed summary with undefined context should not throw",
			);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
		});

		it("throws when not tracking summary", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			assert.throws(
				() => builder.completedSummary(incrementalSummaryContext),
				(error: Error) => validateAssertionError(error, /Not tracking/),
			);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
		});

		it("clears tracking state when called after starting summary", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const summaryBuilder = new SummaryTreeBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			builder.startingSummary(summaryBuilder, false /* fullTree */, incrementalSummaryContext);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);
			assert.doesNotThrow(() => builder.completedSummary(incrementalSummaryContext));
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
		});
	});

	describe("load", () => {
		it("returns early when snapshot tree is not available", async () => {
			const builder = createIncrementalSummaryBuilder();
			const storageService = createMockStorageService(); // No snapshot tree
			await builder.load(storageService, getReadAndParseChunk(new Map()));
		});

		it("loads chunk contents from snapshot tree", async () => {
			const builder = createIncrementalSummaryBuilder();
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

			await builder.load(storageService, getReadAndParseChunk(blobMap));

			// Verify chunks can be retrieved
			const chunk0 = builder.getEncodedIncrementalChunk(0 as ChunkReferenceId);
			const chunk1 = builder.getEncodedIncrementalChunk(1 as ChunkReferenceId);

			assert.deepEqual(
				chunk0,
				blobMap.get("0/contents"),
				"Chunk 0 should match stored contents",
			);
			assert.deepEqual(
				chunk1,
				blobMap.get("1/contents"),
				"Chunk 1 should match stored contents",
			);
		});

		it("loads nested chunk trees recursively", async () => {
			const builder = createIncrementalSummaryBuilder();
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
			await builder.load(storageService, getReadAndParseChunk(blobMap));

			// Verify both parent and nested chunks can be retrieved
			const parentChunk = builder.getEncodedIncrementalChunk(0 as ChunkReferenceId);
			const nestedChunk = builder.getEncodedIncrementalChunk(1 as ChunkReferenceId);

			assert.deepEqual(parentChunk, blobMap.get("0/contents"));
			assert.deepEqual(nestedChunk, blobMap.get("0/1/contents"));
		});

		it("throws when chunk contents are missing", async () => {
			const builder = createIncrementalSummaryBuilder();
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
				async () => builder.load(storageService, getReadAndParseChunk(new Map())),
				(error: Error) => {
					assert(error.message.includes("Cannot find contents for incremental chunk"));
					return true;
				},
				"Expected error when chunk contents are missing",
			);
		});
	});

	describe("encodeIncrementalField", () => {
		const mockEncodedChunk = {} as unknown as EncodedFieldBatch;
		it("throws when not tracking summary", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.throws(
				() => builder.encodeIncrementalField(testCursor, () => mockEncodedChunk),
				(error: Error) => validateAssertionError(error, /Not tracking/),
			);
		});

		it("encodes chunk and returns reference ID when tracking", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			builder.startingSummary(
				new SummaryTreeBuilder(),
				false /* fullTree */,
				incrementalSummaryContext,
			);
			const referenceIds = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			assert.equal(referenceIds.length, 1);
			const referenceId = referenceIds[0];
			assert.equal(typeof referenceId, "number");
		});

		it("always encodes chunks in full tree mode", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			// Start with non full tree mode
			builder.startingSummary(
				new SummaryTreeBuilder(),
				false /* fullTree */,
				incrementalSummaryContext,
			);
			const referenceIds1 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			// Complete first summary
			builder.completedSummary(incrementalSummaryContext);

			// Start new summary - full tree.
			const newIncrementalSummaryContext = createMockIncrementalSummaryContext(20, 10);
			builder.startingSummary(
				new SummaryTreeBuilder(),
				true /* fullTree */,
				newIncrementalSummaryContext,
			);
			// Should still encode (not use handle) because it's full tree mode
			const referenceIds2 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			// Should get different reference IDs because both were encoded
			assert.notDeepEqual(referenceIds1, referenceIds2, "Reference IDs should be different");
		});

		it("creates summary handles for unchanged chunks", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext1 = createMockIncrementalSummaryContext(
				10,
				0,
				"/base/path",
			);
			// First summary
			builder.startingSummary(
				new SummaryTreeBuilder(),
				false /* fullTree */,
				incrementalSummaryContext1,
			);
			const referenceIds1 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			builder.completedSummary(incrementalSummaryContext1);

			// Second summary with same chunk
			const incrementalSummaryContext2 = createMockIncrementalSummaryContext(
				20,
				10,
				"/base/path",
			);
			const summaryBuilder = new SummaryTreeBuilder();
			builder.startingSummary(summaryBuilder, false, incrementalSummaryContext2);
			const referenceIds2 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			// Should reuse the same reference ID
			assert.deepEqual(referenceIds1, referenceIds2, "Reference IDs should match");

			// Verify that a handle was added to the summary builder
			assert.equal(referenceIds1.length, 1);
			const referenceId1 = referenceIds1[0];
			const summary = summaryBuilder.getSummaryTree();
			const summaryEntry: { type?: SummaryType } | undefined =
				summary.summary.tree[`${referenceId1}`];
			assert.equal(summaryEntry?.type, SummaryType.Handle);
		});

		it("creates summary handles for unchanged chunks even if previous summary failed", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			// First summary
			builder.startingSummary(
				new SummaryTreeBuilder(),
				false /* fullTree */,
				incrementalSummaryContext,
			);
			const referenceIds1 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			builder.completedSummary(incrementalSummaryContext);

			// Start new summary and don't encode any chunks.
			const incrementalSummaryContext2 = createMockIncrementalSummaryContext(20, 10);
			builder.startingSummary(
				new SummaryTreeBuilder(),
				false /* fullTree */,
				incrementalSummaryContext2,
			);
			builder.completedSummary(incrementalSummaryContext2);

			// Now start a new summary and use the first summary's sequence number as the latestSummarySequenceNumber
			// to simulate a failure of the previous summary.
			const summaryBuilder = new SummaryTreeBuilder();
			const incrementalSummaryContext3 = createMockIncrementalSummaryContext(30, 10);
			builder.startingSummary(
				summaryBuilder,
				false /* fullTree */,
				incrementalSummaryContext3,
			);

			// Should reuse the same reference ID since the chunk hasn't changed since the last successful summary.
			const referenceIds2 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			assert.deepEqual(referenceIds1, referenceIds2, "Reference IDs should match");

			// Verify that a handle was added to the summary builder
			assert.equal(referenceIds1.length, 1);
			const referenceId1 = referenceIds1[0];
			const summary = summaryBuilder.getSummaryTree();
			const summaryEntry: { type?: SummaryType } | undefined =
				summary.summary.tree[`${referenceId1}`];
		});
	});

	describe("getEncodedIncrementalChunk", () => {
		it("returns encoded chunk when it exists", async () => {
			const builder = createIncrementalSummaryBuilder();
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
			await builder.load(storageService, getReadAndParseChunk(blobMap));

			const result = builder.getEncodedIncrementalChunk(0 as ChunkReferenceId);
			assert.deepEqual(
				result,
				blobMap.get("0/contents"),
				"Should return correct chunk contents",
			);
		});

		it("throws when encoded chunk does not exist", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.throws(
				() => builder.getEncodedIncrementalChunk(999 as ChunkReferenceId),
				(error: Error) =>
					validateAssertionError(error, "Incremental chunk contents not found"),
			);
		});
	});
});
