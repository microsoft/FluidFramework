/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { SummaryType, type ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	ForestIncrementalSummaryBehavior,
	ForestIncrementalSummaryBuilder,
	ForestSummaryTrackingState,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/incrementalSummaryBuilder.js";
import {
	summaryContentBlobKey,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/summaryFormatV3.js";
import {
	summaryContentBlobKey as summaryContentBlobKeyV1ToV2,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/summaryFormatV1ToV2.js";
import {
	type EncodedFieldBatch,
	type ChunkReferenceId,
	type TreeChunk,
	defaultIncrementalEncodingPolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/index.js";
import type { ITreeCursorSynchronous } from "../../../core/index.js";
import { brand, type JsonCompatible } from "../../../util/index.js";
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
): (chunkPath: string) => Promise<T> {
	return async (chunkPath: string): Promise<T> => {
		const blob = chunkMap.get(chunkPath);
		if (blob === undefined) {
			throw new Error(`Blob not found: ${chunkPath}`);
		}
		return blob as T;
	};
}

/**
 * Returns a mock TreeChunk for testing. It is a minimal implementation that only implements the `referenceAdded`
 * method since that is the only method of the `TreeChunk` used by the `ForestIncrementalSummaryBuilder`.
 */
function getMockChunk(): TreeChunk {
	return { referenceAdded: () => {} } as unknown as TreeChunk;
}

const testCursor = { getFieldLength: () => 1 } as unknown as ITreeCursorSynchronous;

const stringify = JSON.stringify;
const mockForestSummaryRootContent = "test-summary-content";
const mockEncodedChunk = {} as unknown as EncodedFieldBatch;
const initialSequenceNumber = 0;

describe("ForestIncrementalSummaryBuilder", () => {
	function createIncrementalSummaryBuilder() {
		const mockChunk = getMockChunk();
		return new ForestIncrementalSummaryBuilder(
			true /* enableIncrementalSummary */,
			(cursor: ITreeCursorSynchronous) => {
				return [mockChunk];
			},
			defaultIncrementalEncodingPolicy,
			initialSequenceNumber,
		);
	}

	describe("startSummary", () => {
		it("returns ForestIncrementalSummaryBehavior.SingleBlob when incrementalSummaryContext is undefined", () => {
			const builder = createIncrementalSummaryBuilder();
			const behavior = builder.startSummary({
				fullTree: false,
				incrementalSummaryContext: undefined,
				stringify,
				builder: new SummaryTreeBuilder(),
			});
			assert.equal(behavior, ForestIncrementalSummaryBehavior.SingleBlob);
		});

		it("returns ForestIncrementalSummaryBehavior.Incremental when incrementalSummaryContext is defined", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(1, 0);
			const behavior = builder.startSummary({
				fullTree: false,
				incrementalSummaryContext,
				stringify,
				builder: new SummaryTreeBuilder(),
			});
			assert.equal(behavior, ForestIncrementalSummaryBehavior.Incremental);
		});
		it("returns ForestIncrementalSummaryBehavior.Incremental when fullTree is true", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			const incrementalSummaryBehavior = builder.startSummary({
				fullTree: true,
				incrementalSummaryContext,
				stringify,
				builder: new SummaryTreeBuilder(),
			});
			assert.equal(incrementalSummaryBehavior, ForestIncrementalSummaryBehavior.Incremental);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);
		});

		it("throws when already tracking", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(100, 90);

			// Start tracking first summary
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext,
				stringify,
				builder: new SummaryTreeBuilder(),
			});
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);

			// Attempting to start another should throw
			assert.throws(
				() =>
					builder.startSummary({
						fullTree: false,
						incrementalSummaryContext,
						stringify,
						builder: new SummaryTreeBuilder(),
					}),
				validateAssertionError(/Already tracking/),
			);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);
		});
	});

	describe("completeSummary", () => {
		it("returns tree without incremental chunks when incrementalSummaryContext is undefined", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const summaryTreeBuilder = new SummaryTreeBuilder();
			builder.completeSummary({
				incrementalSummaryContext: undefined,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKeyV1ToV2,
				builder: summaryTreeBuilder,
			});
			const summary = summaryTreeBuilder.getSummaryTree();
			// The summary tree should only contain the forest top-level content blob.
			assert.equal(Object.keys(summary.summary.tree).length, 1);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
		});

		it("returns tree with incremental chunks when incremental field is encoded", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			const summaryTreeBuilder = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext,
				stringify,
				builder: summaryTreeBuilder,
			});
			builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			builder.completeSummary({
				incrementalSummaryContext,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKey,
				builder: summaryTreeBuilder,
			});
			const summary = summaryTreeBuilder.getSummaryTree();
			// The summary tree should contain the forest top-level content blob and incremental summary chunk node.
			assert.equal(Object.keys(summary.summary.tree).length, 2);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
		});

		it("clears tracking state when called after starting summary", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const localIncrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			const summaryTreeBuilder = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext: localIncrementalSummaryContext,
				stringify,
				builder: summaryTreeBuilder,
			});
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.Tracking);

			builder.completeSummary({
				incrementalSummaryContext: localIncrementalSummaryContext,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKey,
				builder: summaryTreeBuilder,
			});
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
		});

		it("throws when not tracking summary", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
			const localIncrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			assert.throws(
				() =>
					builder.completeSummary({
						incrementalSummaryContext: localIncrementalSummaryContext,
						forestSummaryRootContent: mockForestSummaryRootContent,
						forestSummaryRootContentKey: summaryContentBlobKey,
						builder: new SummaryTreeBuilder(),
					}),
				validateAssertionError(/Not tracking/),
			);
			assert.equal(builder.forestSummaryState, ForestSummaryTrackingState.ReadyToTrack);
		});
	});

	describe("load", () => {
		it("returns early when snapshot tree is not available", async () => {
			const builder = createIncrementalSummaryBuilder();
			const storageService = createMockStorageService(); // No snapshot tree
			await builder.load({
				services: storageService,
				readAndParseChunk: getReadAndParseChunk(new Map()),
			});
		});

		it("loads chunk contents from snapshot tree", async () => {
			const referenceId0: ChunkReferenceId = brand(0);
			const referenceId1: ChunkReferenceId = brand(1);
			const chunkContentsPath0 = `${referenceId0}/contents`;
			const chunkContentsPath1 = `${referenceId1}/contents`;
			const builder = createIncrementalSummaryBuilder();
			const blobMap = new Map([
				[chunkContentsPath0, "chunk0"],
				[chunkContentsPath1, "chunk1"],
			]);
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					[`${referenceId0}`]: {
						trees: {},
						blobs: {
							contents: blobMap.get(chunkContentsPath0) ?? "",
						},
					},
					[`${referenceId1}`]: {
						trees: {},
						blobs: {
							contents: blobMap.get(chunkContentsPath1) ?? "",
						},
					},
				},
				blobs: {},
			};
			const storageService = createMockStorageService(mockSnapshotTree, blobMap);

			await builder.load({
				services: storageService,
				readAndParseChunk: getReadAndParseChunk(blobMap),
			});

			// Verify chunks can be retrieved
			builder.decodeIncrementalChunk(referenceId0, (encoded) => {
				assert.deepEqual(encoded, blobMap.get(chunkContentsPath0));
				return getMockChunk();
			});
			builder.decodeIncrementalChunk(referenceId1, (encoded) => {
				assert.deepEqual(encoded, blobMap.get(chunkContentsPath1));
				return getMockChunk();
			});
		});

		it("loads nested chunk trees recursively", async () => {
			const referenceId0: ChunkReferenceId = brand(0);
			const referenceId1: ChunkReferenceId = brand(1);
			const parentContentsPath = `${referenceId0}/contents`;
			const childContentsPath = `${referenceId0}/${referenceId1}/contents`;
			const builder = createIncrementalSummaryBuilder();
			const blobMap = new Map([
				[parentContentsPath, "chunk0"],
				[childContentsPath, "chunk1"],
			]);
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					[`${referenceId0}`]: {
						trees: {
							[`${referenceId1}`]: {
								trees: {},
								blobs: {
									contents: blobMap.get(childContentsPath) ?? "",
								},
							},
						},
						blobs: {
							contents: blobMap.get(parentContentsPath) ?? "",
						},
					},
				},
				blobs: {},
			};
			const storageService = createMockStorageService(mockSnapshotTree, blobMap);
			await builder.load({
				services: storageService,
				readAndParseChunk: getReadAndParseChunk(blobMap),
			});

			// Verify both parent and nested chunks can be retrieved
			builder.decodeIncrementalChunk(referenceId0, (encoded) => {
				assert.deepEqual(encoded, blobMap.get(parentContentsPath));
				return getMockChunk();
			});
			builder.decodeIncrementalChunk(referenceId1, (encoded) => {
				assert.deepEqual(encoded, blobMap.get(childContentsPath));
				return getMockChunk();
			});
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
				async () =>
					builder.load({
						services: storageService,
						readAndParseChunk: getReadAndParseChunk(new Map()),
					}),
				(error: Error) => {
					assert(error.message.includes("Cannot find contents for incremental chunk"));
					return true;
				},
				"Expected error when chunk contents are missing",
			);
		});
	});

	describe("encodeIncrementalField", () => {
		it("throws when not tracking summary", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.throws(
				() => builder.encodeIncrementalField(testCursor, () => mockEncodedChunk),
				validateAssertionError(/Not tracking/),
			);
		});

		it("encodes chunk and returns reference ID when tracking", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext,
				stringify,
				builder: new SummaryTreeBuilder(),
			});
			const referenceIds = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			assert.equal(referenceIds.length, 1);
			const referenceId = referenceIds[0];
			assert.equal(typeof referenceId, "number");
		});

		it("always encodes chunks in full tree mode", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			// Start with non full tree mode
			const summaryTreeBuilder1 = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext,
				stringify,
				builder: summaryTreeBuilder1,
			});
			const referenceIds1 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			// Complete first summary
			builder.completeSummary({
				incrementalSummaryContext,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKey,
				builder: summaryTreeBuilder1,
			});

			// Start new summary - full tree.
			const newIncrementalSummaryContext = createMockIncrementalSummaryContext(20, 10);
			const summaryTreeBuilder2 = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: true,
				incrementalSummaryContext: newIncrementalSummaryContext,
				stringify,
				builder: summaryTreeBuilder2,
			});
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
			const summaryTreeBuilder1 = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext: incrementalSummaryContext1,
				stringify,
				builder: summaryTreeBuilder1,
			});
			const referenceIds1 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			builder.completeSummary({
				incrementalSummaryContext: incrementalSummaryContext1,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKey,
				builder: summaryTreeBuilder1,
			});

			// Second summary with same chunk
			const incrementalSummaryContext2 = createMockIncrementalSummaryContext(
				20,
				10,
				"/base/path",
			);
			const summaryTreeBuilder2 = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext: incrementalSummaryContext2,
				stringify,
				builder: summaryTreeBuilder2,
			});
			const referenceIds2 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			// Should reuse the same reference ID
			assert.deepEqual(referenceIds1, referenceIds2, "Reference IDs should match");

			// Verify that a handle was added to the summary builder
			assert.equal(referenceIds1.length, 1);
			const referenceId1 = referenceIds1[0];
			builder.completeSummary({
				incrementalSummaryContext: incrementalSummaryContext2,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKey,
				builder: summaryTreeBuilder2,
			});
			const summary = summaryTreeBuilder2.getSummaryTree();
			const summaryEntry: { type?: SummaryType } | undefined =
				summary.summary.tree[`${referenceId1}`];
			assert.equal(summaryEntry?.type, SummaryType.Handle);
		});

		it("creates summary handles for unchanged chunks even if previous summary failed", () => {
			const builder = createIncrementalSummaryBuilder();
			const incrementalSummaryContext = createMockIncrementalSummaryContext(10, 0);
			// First summary
			const summaryTreeBuilder1 = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext,
				stringify,
				builder: summaryTreeBuilder1,
			});
			const referenceIds1 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			builder.completeSummary({
				incrementalSummaryContext,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKey,
				builder: summaryTreeBuilder1,
			});

			// Start new summary and don't encode any chunks.
			const incrementalSummaryContext2 = createMockIncrementalSummaryContext(20, 10);
			const summaryTreeBuilder2 = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext: incrementalSummaryContext2,
				stringify,
				builder: summaryTreeBuilder2,
			});
			builder.completeSummary({
				incrementalSummaryContext: incrementalSummaryContext2,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKey,
				builder: summaryTreeBuilder2,
			});

			// Now start a new summary and use the first summary's sequence number as the latestSummarySequenceNumber
			// to simulate a failure of the previous summary.
			const incrementalSummaryContext3 = createMockIncrementalSummaryContext(30, 10);
			const summaryTreeBuilder3 = new SummaryTreeBuilder();
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext: incrementalSummaryContext3,
				stringify,
				builder: summaryTreeBuilder3,
			});

			// Should reuse the same reference ID since the chunk hasn't changed since the last successful summary.
			const referenceIds2 = builder.encodeIncrementalField(testCursor, () => mockEncodedChunk);
			assert.deepEqual(referenceIds1, referenceIds2, "Reference IDs should match");

			// Verify that a handle was added to the summary builder
			assert.equal(referenceIds1.length, 1);
			const referenceId1 = referenceIds1[0];
			builder.completeSummary({
				incrementalSummaryContext: incrementalSummaryContext3,
				forestSummaryRootContent: mockForestSummaryRootContent,
				forestSummaryRootContentKey: summaryContentBlobKey,
				builder: summaryTreeBuilder3,
			});
			const summary = summaryTreeBuilder3.getSummaryTree();
			const summaryEntry: { type?: SummaryType } | undefined =
				summary.summary.tree[`${referenceId1}`];
			assert.equal(summaryEntry?.type, SummaryType.Handle);
		});

		it("should assign increasing chunk reference IDs for new chunks after load", async () => {
			// Load a builder with an existing chunk with the following chunk reference ID.
			const referenceId: ChunkReferenceId = brand(1);
			const builder = createIncrementalSummaryBuilder();
			const blobMap = new Map([[`${referenceId}/contents`, "chunk0"]]);
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					[`${referenceId}`]: {
						trees: {},
						blobs: {
							contents: blobMap.get(`${referenceId}/contents`) ?? "",
						},
					},
				},
				blobs: {},
			};
			const storageService = createMockStorageService(mockSnapshotTree, blobMap);
			await builder.load({
				services: storageService,
				readAndParseChunk: getReadAndParseChunk(blobMap),
			});

			// Notify the builder that the chunk with the above reference ID was decoded.
			builder.decodeIncrementalChunk(referenceId, () => getMockChunk());

			const incrementalSummaryContext = createMockIncrementalSummaryContext(
				initialSequenceNumber + 1,
				initialSequenceNumber,
			);
			builder.startSummary({
				fullTree: false,
				incrementalSummaryContext,
				stringify,
				builder: new SummaryTreeBuilder(),
			});
			// The encoded chunk should be assigned the next chunk reference ID.
			const newReferenceIds = builder.encodeIncrementalField(
				testCursor,
				() => mockEncodedChunk,
			);
			assert.equal(newReferenceIds.length, 1);
			const newReferenceId = newReferenceIds[0];
			assert.equal(newReferenceId, referenceId + 1);
		});
	});

	describe("decodeIncrementalChunk", () => {
		it("decodes chunk when it exists", async () => {
			const referenceId0: ChunkReferenceId = brand(0);
			const chunkContentsPath0 = `${referenceId0}/contents`;
			const builder = createIncrementalSummaryBuilder();
			const blobMap = new Map([[chunkContentsPath0, "chunk0"]]);
			const mockSnapshotTree: ISnapshotTree = {
				trees: {
					[`${referenceId0}`]: {
						trees: {},
						blobs: {
							contents: blobMap.get(chunkContentsPath0) ?? "",
						},
					},
				},
				blobs: {},
			};

			const storageService = createMockStorageService(mockSnapshotTree, blobMap);
			await builder.load({
				services: storageService,
				readAndParseChunk: getReadAndParseChunk(blobMap),
			});
			builder.decodeIncrementalChunk(referenceId0, (encoded) => {
				assert.deepEqual(encoded, blobMap.get(chunkContentsPath0));
				return getMockChunk();
			});
		});

		it("throws when encoded chunk does not exist", () => {
			const builder = createIncrementalSummaryBuilder();
			assert.throws(
				() =>
					builder.decodeIncrementalChunk(999 as ChunkReferenceId, (encoded) => {
						return getMockChunk();
					}),
				validateAssertionError("Encoded incremental chunk not found"),
			);
		});
	});
});
