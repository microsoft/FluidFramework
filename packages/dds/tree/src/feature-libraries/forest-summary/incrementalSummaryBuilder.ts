/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";

import type { ITreeCursorSynchronous } from "../../core/index.js";
import type { SummaryElementStringifier } from "../../shared-tree-core/index.js";
import {
	brand,
	setInNestedMap,
	tryGetFromNestedMap,
	type JsonCompatible,
	type NestedMap,
} from "../../util/index.js";
import type {
	ChunkReferenceId,
	EncodedFieldBatchV2,
	IncrementalEncoderDecoder,
	IncrementalEncodingPolicy,
	TreeChunk,
} from "../chunked-forest/index.js";

import { summaryContentBlobKey } from "./summaryFormatV3.js";

/**
 * The properties of a chunk tracked during the loading process.
 * These are used to identify a chunk when it is decoded and recreate the tracking state
 * as it was when the summary that the client is loading from was generated.
 *
 * An encoded chunk, paired with a location it can be reused / reloaded from.
 * @remarks
 * This identifies a location in a specific summary where `encodedContents` was loaded from.
 *
 * When summarizing, Fluid always ensures the summary that the summary client is allowed to reuse content from
 * is the one it loaded from, so tracking this on load is sufficient for now:
 * there is no need to track the equivalent data when summarizing.
 */
interface ChunkLoadProperties {
	/**
	 * The encoded contents of the chunk.
	 */
	readonly encodedContents: EncodedFieldBatchV2;
	/**
	 * The reference ID of this chunk's parent in the summary tree, or `undefined` if this chunk is
	 * at the top level (directly under the forest summary tree).
	 * Stored here so that {@link ForestIncrementalSummaryBuilder.decodeIncrementalChunk} can
	 * reconstruct the correct {@link ChunkSummaryProperties} without re-parsing a path string.
	 */
	readonly parentReferenceId: ChunkReferenceId | undefined;
}

/**
 * The properties of a chunk that is tracked for every summary.
 * If a chunk doesn't change between summaries,
 * these properties will be used to generate a summary handle for the chunk.
 */
interface ChunkSummaryProperties {
	/**
	 * The reference ID of the chunk which uniquely identifies it under its parent's summary tree.
	 * The summary for this chunk will be stored against this reference ID as key in the summary tree.
	 */
	readonly referenceId: ChunkReferenceId;
	/**
	 * The reference ID of this chunk's parent in the summary tree, or `undefined` if this chunk
	 * is at the top level (has no incremental parent).
	 *
	 * @remarks
	 * Storing only the immediate parent (rather than the full path string) keeps every chunk's
	 * tracking entry correct even when an ancestor is re-encoded and receives a new reference ID.
	 * The full summary path is computed on demand by {@link ForestIncrementalSummaryBuilder.computeHandlePathInLatestSummary}
	 * by walking up the parent chain through {@link TrackedSummaryProperties.latestSummaryRefIdMap}.
	 *
	 * If a parent chunk is encoded as a handle in the current summary its reference ID is unchanged,
	 * so its children's `parentReferenceId` values copied forward by `completeSummary` remain valid
	 * without any additional update.
	 */
	readonly parentReferenceId: ChunkReferenceId | undefined;
}

/**
 * The properties of a summary being tracked.
 */
interface TrackedSummaryProperties {
	/**
	 * The sequence number of the summary in progress.
	 */
	readonly summarySequenceNumber: number;
	/**
	 * The base path for the latest summary that was successful.
	 * This is used to generate summary handles.
	 */
	readonly latestSummaryBasePath: string;
	/**
	 * Whether the summary being tracked is a full tree summary.
	 * If true, the summary will not contain any summary handles. All chunks must be summarized in full.
	 */
	readonly fullTree: boolean;
	/**
	 * Represents the path of a chunk in the summary tree relative to the forest's summary tree.
	 * Each item in the array is the {@link ChunkReferenceId} of a chunk in the summary tree starting
	 * from the chunk under forest summary tree.
	 * When a chunk is summarized, this array will be used to generate the path for the chunk's summary in the
	 * summary tree.
	 */
	readonly chunkSummaryPath: ChunkReferenceId[];
	/**
	 * The parent summary builder to use to build the incremental summary tree.
	 * When a chunk is being summarized, it will add its summary to this builder against its reference ID.
	 */
	parentSummaryBuilder: SummaryTreeBuilder;
	/**
	 * Serializes content (including {@link (IFluidHandle:interface)}s) for adding to a summary blob.
	 */
	stringify: SummaryElementStringifier;
	/**
	 * Reverse lookup map for the latest summary: maps each chunk's {@link ChunkReferenceId} to its
	 * {@link ChunkSummaryProperties}.
	 * Used by {@link ForestIncrementalSummaryBuilder.computeHandlePathInLatestSummary} to traverse
	 * the parent chain when generating handle paths.
	 */
	readonly latestSummaryRefIdMap: Map<ChunkReferenceId, ChunkSummaryProperties>;
}

/**
 * The behavior of the forest's incremental summary - whether the summary should be a single blob or incremental.
 */
export enum ForestIncrementalSummaryBehavior {
	/**
	 * The forest can encode chunks incrementally, i.e., chunks that support incremental encoding will be encoded
	 * separately - they will be added to a separate tree.
	 * The incremental summary format is described in {@link ForestIncrementalSummaryBuilder}.
	 */
	Incremental,
	/**
	 * The forest should encode all of it's data in a single summary blob.
	 * @remarks
	 * The format of the summary will be the same as the old format (pre-incremental summaries) and is fully
	 * backwards compatible with the old format. The summary will basically look like an incremental summary
	 * with no incremental fields - it will only contain the "ForestTree" blob in the summary format described
	 * in {@link ForestIncrementalSummaryBuilder}.
	 */
	SingleBlob,
}

/* eslint-disable jsdoc/check-indentation */
/**
 * Tracks and builds the incremental summary tree for a forest where chunks that support incremental encoding are
 * stored in a separate tree in the summary under its {@link ChunkReferenceId}.
 * The summary tree for a chunk is self-sufficient and can be independently loaded and used to reconstruct the
 * chunk's contents without any additional context from its parent.
 *
 * An example summary tree with incremental summary:
 *     Forest
 *     ├── contents
 *     ├── 0
 *     |   ├── contents
 *     |   ├── 1
 *     |   |   ├── contents
 *     |   |   ├── 2
 *     |   |   |   ├── contents
 *     |   ├── 3 - ".../Forest/ForestTree/0/1/3"
 *     ├── 4
 *     |   ├── contents
 *     |   ├── ...
 *     ├── 5 - "/.../Forest/ForestTree/5"
 * - Forest is a summary tree node added by the shared tree and contains the following:
 *   - The inline portion of the top-level forest content is stored in a summary blob called "contents".
 *     It also contains the {@link ChunkReferenceId}s of the incremental chunks under it.
 *   - The summary for each incremental chunk under it is stored against its {@link ChunkReferenceId}.
 * - For each chunk, the structure of the summary tree is the same as the Forest. It contains the following:
 *   - The inline portion of the chunk content is stored in a blob called "contents".
 *     It also contains the {@link ChunkReferenceId}s of the incremental chunks under it.
 *   - The summary for each incremental chunk under it is stored against its {@link ChunkReferenceId}.
 * - Chunks that do not change between summaries are summarized as handles in the summary tree.
 *
 * TODO: AB#46752
 * Add strong types for the summary structure to document it better. It will help make it super clear what the actual
 * format is in a way that can easily be linked to, documented and inspected.
 */
/* eslint-enable jsdoc/check-indentation */
export class ForestIncrementalSummaryBuilder implements IncrementalEncoderDecoder {
	/**
	 * The next reference ID to use for a chunk.
	 */
	private nextReferenceId: ChunkReferenceId = brand(0);

	/**
	 * For a given summary sequence number, keeps track of a chunk's properties that will be used to generate
	 * a summary handle for the chunk if it does not change between summaries.
	 *
	 * @remarks
	 * `chunk` (the TreeChunk object) is used as the map key by object identity.
	 * This assumes each chunk appears at exactly one position in the forest — an invariant that holds because every
	 * node in a tree has a single parent.
	 * If the forest ever introduced structural sharing (two positions backed by the same TreeChunk object),
	 * a second call here would silently overwrite the first entry, causing the first position's handle to point
	 * to the second position's parent in subsequent summaries. In theory, this should be fine from summary perspective
	 * because the chunk contents are the same. But, it could lead to confusing handle paths in the summary tree and
	 * may lead to other unexpected behavior. Adequate tests should be added if structural sharing is introduced.
	 */
	private readonly chunkTrackingPropertiesMap: NestedMap<
		number,
		TreeChunk,
		ChunkSummaryProperties
	> = new Map();

	/**
	 * True when encoding a summary, false otherwise.
	 * @remarks
	 * Exposed for testing purposes.
	 */
	public get isSummarizing(): boolean {
		return this.trackedSummaryProperties !== undefined;
	}
	/**
	 * The sequence number of the latest summary that was successful.
	 */
	private latestSummarySequenceNumber: number = -1;

	/**
	 * The current state of the summary being "tracked".
	 * @remarks
	 * A summary being "tracked" means that a summary is being encoded.
	 * This is undefined if no summary is currently being encoded.
	 *
	 * @privateRemarks
	 * This has nothing to do which how content from a summary being loaded is tracked (thats written all in chunkTrackingPropertiesMap).
	 * "Tracked" should probably be renamed to "encoded" or "summarizing" or something like that to avoid confusion.
	 * Perhaps a better way to clarify this would be to not store this property on this object at all, and have it
	 * only exist within the scope of the summary encoding (use an encoding specific object to accumulate any stat necessary during encode).
	 */
	private trackedSummaryProperties: TrackedSummaryProperties | undefined;

	/**
	 * A map of chunk reference IDs to their encoded contents. This is typically used during the loading of the
	 * forest to retrieve the contents of the chunks that were summarized incrementally.
	 */
	/**
	 * A map of chunk reference IDs to their {@link ChunkLoadProperties}.
	 * This is used during the loading of the forest to track each chunk that is retrieved and decoded.
	 */
	private readonly loadedChunksMap: Map<string, ChunkLoadProperties> = new Map();

	public constructor(
		private readonly enableIncrementalSummary: boolean,
		private readonly getChunkAtCursor: (cursor: ITreeCursorSynchronous) => TreeChunk[],
		public readonly shouldEncodeIncrementally: IncrementalEncodingPolicy,
		private readonly initialSequenceNumber: number,
	) {}

	/**
	 * Must be called when the forest is loaded to download the encoded contents of incremental chunks.
	 * @param services - The channel storage service to use to access the snapshot tree and download the
	 * contents of the chunks.
	 * @param readAndParse - A function that reads and parses a blob from the storage service.
	 */
	public async load(args: {
		services: IChannelStorageService;
		readAndParseChunk: (chunkBlobPath: string) => Promise<JsonCompatible<IFluidHandle>>;
	}): Promise<void> {
		const forestTree = args.services.getSnapshotTree?.();
		// Snapshot tree should be available when loading forest's contents. However, it is an optional function
		// and may not be implemented by the storage service.
		if (forestTree === undefined) {
			return;
		}

		// Downloads the contents of incremental chunks in the given snapshot tree. Also, recursively downloads
		// the contents of incremental chunks in any sub-trees.
		const downloadChunkContentsInTree = async (
			snapshotTree: ISnapshotTree,
			parentPathSegments: string[],
			parentReferenceId: ChunkReferenceId | undefined,
		): Promise<void> => {
			// All trees in the snapshot tree are for incremental chunks. The key is the chunk's reference ID
			// and the value is the snapshot tree for the chunk.
			for (const [chunkReferenceId, chunkSnapshotTree] of Object.entries(snapshotTree.trees)) {
				const chunkSubTreeSegments = [...parentPathSegments, chunkReferenceId];
				const chunkSubTreePath = chunkSubTreeSegments.join("/");
				const chunkContentsPath = `${chunkSubTreePath}/${summaryContentBlobKey}`;
				if (!(await args.services.contains(chunkContentsPath))) {
					throw new LoggingError(
						`SharedTree: Cannot find contents for incremental chunk ${chunkContentsPath}`,
					);
				}
				const chunkContents = (await args.readAndParseChunk(
					chunkContentsPath,
				)) as EncodedFieldBatchV2; // TODO: this should use a codec to validate the data instead of just type casting.
				this.loadedChunksMap.set(chunkReferenceId, {
					encodedContents: chunkContents,
					parentReferenceId,
				});

				const chunkReferenceIdNumber = Number(chunkReferenceId);
				this.nextReferenceId = brand(
					Math.max(this.nextReferenceId, chunkReferenceIdNumber + 1),
				);

				// Recursively download the contents of chunks in this chunk's sub tree.
				await downloadChunkContentsInTree(
					chunkSnapshotTree,
					chunkSubTreeSegments,
					brand(chunkReferenceIdNumber),
				);
			}
		};
		// parentReferenceId is undefined for the root of the forest tree.
		await downloadChunkContentsInTree(forestTree, [], undefined /* parentReferenceId */);
	}

	/**
	 * Asserts that a summary is currently being tracked and that the tracked summary properties are defined.
	 * @returns The properties of the tracked summary.
	 */
	private requireTrackingSummary(): TrackedSummaryProperties {
		assert(this.trackedSummaryProperties !== undefined, 0xc22 /* Not tracking a summary */);
		return this.trackedSummaryProperties;
	}

	/**
	 * Must be called when starting a new forest summary to track it.
	 * @param fullTree - Whether the summary is a full tree summary. If true, the summary will not contain
	 * any summary handles. All chunks must be summarized in full.
	 * @param incrementalSummaryContext - The context for the incremental summary that contains the sequence numbers
	 * for the current and latest summaries.
	 * @param stringify - Serializes content (including {@link (IFluidHandle:interface)}s) for adding to a summary blob.
	 * @returns the behavior of the forest's incremental summary.
	 */
	public startSummary(args: {
		fullTree: boolean;
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined;
		stringify: SummaryElementStringifier;
		builder: SummaryTreeBuilder;
	}): ForestIncrementalSummaryBehavior {
		assert(
			this.trackedSummaryProperties === undefined,
			0xc24 /* Already tracking a summary */,
		);

		const { fullTree, incrementalSummaryContext, stringify, builder } = args;
		// If there is no incremental summary context, do not summarize incrementally. This happens in two scenarios:
		// 1. When summarizing a detached container, i.e., the first ever summary.
		// 2. When running GC, the default behavior is to call summarize on DDS without incrementalSummaryContext.
		if (!this.enableIncrementalSummary || incrementalSummaryContext === undefined) {
			return ForestIncrementalSummaryBehavior.SingleBlob;
		}

		this.latestSummarySequenceNumber = incrementalSummaryContext.latestSummarySequenceNumber;

		// Build a reverse lookup map (referenceId → properties) for the latest summary so that
		// computeHandlePathInLatestSummary can traverse the parent chain without iterating the whole map.
		const latestSummaryRefIdMap: Map<ChunkReferenceId, ChunkSummaryProperties> = new Map();
		const latestTracking = this.chunkTrackingPropertiesMap.get(
			this.latestSummarySequenceNumber,
		);
		if (latestTracking !== undefined) {
			for (const properties of latestTracking.values()) {
				latestSummaryRefIdMap.set(properties.referenceId, properties);
			}
		}

		this.trackedSummaryProperties = {
			summarySequenceNumber: incrementalSummaryContext.summarySequenceNumber,
			latestSummaryBasePath: incrementalSummaryContext.summaryPath,
			chunkSummaryPath: [],
			parentSummaryBuilder: builder,
			fullTree,
			stringify,
			latestSummaryRefIdMap,
		};
		return ForestIncrementalSummaryBehavior.Incremental;
	}

	/**
	 * Computes a chunk's path in the latest summary by traversing up the parent chain via
	 * {@link latestSummaryRefIdMap}.
	 *
	 * Each {@link ChunkSummaryProperties.parentReferenceId} points to the chunk's parent as it
	 * appeared in the summary where the entry was last written. Walking up the chain from the
	 * chunk to the root produces the full path that can be used in a summary handle path.
	 */
	private computeHandlePathInLatestSummary(chunkProperties: ChunkSummaryProperties): string {
		const { latestSummaryRefIdMap } = this.requireTrackingSummary();
		const pathSegments: string[] = [];
		let current: ChunkSummaryProperties | undefined = chunkProperties;
		while (current !== undefined) {
			pathSegments.push(`${current.referenceId}`);
			if (current.parentReferenceId === undefined) {
				break;
			}
			current = latestSummaryRefIdMap.get(current.parentReferenceId);
			assert(
				current !== undefined,
				0xcf7 /* Parent chunk not found in latest summary tracking */,
			);
		}
		// Segments are collected leaf-to-root and then reversed. The alternative would be to use unshift
		// instead of push and reverse. However, using push and reverse is O(n) whereas using unshift would be O(n²).
		return pathSegments.reverse().join("/");
	}

	/**
	 * {@link IncrementalEncoder.encodeIncrementalField}
	 * @remarks Returns an empty array if the field has no content.
	 */
	public encodeIncrementalField(
		cursor: ITreeCursorSynchronous,
		chunkEncoder: (chunk: TreeChunk) => EncodedFieldBatchV2,
	): ChunkReferenceId[] {
		// Validate that a summary is currently being tracked and that the tracked summary properties are defined.
		const trackedSummaryProperties = this.requireTrackingSummary();

		const chunkReferenceIds: ChunkReferenceId[] = [];
		const chunks = this.getChunkAtCursor(cursor);
		for (const chunk of chunks) {
			// Try and get the properties of the chunk from the latest successful summary.
			// If it exists and the summary is not a full tree, use the properties to generate a summary handle.
			// If it does not exist, encode the chunk and generate new properties for it.
			const previousChunkProperties = tryGetFromNestedMap(
				this.chunkTrackingPropertiesMap,
				this.latestSummarySequenceNumber,
				chunk,
			);
			let chunkReferenceId: ChunkReferenceId;
			if (previousChunkProperties !== undefined && !trackedSummaryProperties.fullTree) {
				chunkReferenceId = previousChunkProperties.referenceId;
				// Compute this chunk's path in the latest summary by traversing the parent chain.
				// Using parentReferenceId traversal (rather than a stored path string) ensures the
				// path is correct even when an ancestor was re-encoded in a prior summary and
				// received a new referenceId — the stored summaryPath would have been stale in
				// that case.
				const handlePath = this.computeHandlePathInLatestSummary(previousChunkProperties);
				trackedSummaryProperties.parentSummaryBuilder.addHandle(
					`${chunkReferenceId}`,
					SummaryType.Tree,
					`${trackedSummaryProperties.latestSummaryBasePath}/${handlePath}`,
				);
			} else {
				// Generate a new reference ID for the chunk.
				const newReferenceId: ChunkReferenceId = brand(this.nextReferenceId++);
				chunkReferenceId = newReferenceId;

				// Add the reference ID of this chunk to the chunk summary path before encoding so
				// that any incremental chunks in the subtree use the correct parent path.
				trackedSummaryProperties.chunkSummaryPath.push(newReferenceId);

				const parentSummaryBuilder = trackedSummaryProperties.parentSummaryBuilder;
				// Create a new summary builder for this chunk to build its summary tree which will be stored in the
				// parent's summary tree under its reference ID.
				// Before encoding the chunk, set the parent summary builder to this chunk's summary builder so that
				// any incremental chunks in the subtree of this chunk will use that as their parent summary builder.
				const chunkSummaryBuilder = new SummaryTreeBuilder();
				trackedSummaryProperties.parentSummaryBuilder = chunkSummaryBuilder;
				chunkSummaryBuilder.addBlob(
					summaryContentBlobKey,
					trackedSummaryProperties.stringify(chunkEncoder(chunk)),
				);

				// Add this chunk's summary tree to the parent's summary tree. The summary tree contains its encoded
				// contents and the summary trees of any incremental chunks under it.
				parentSummaryBuilder.addWithStats(
					`${newReferenceId}`,
					chunkSummaryBuilder.getSummaryTree(),
				);

				// Restore the parent summary builder and chunk summary path.
				trackedSummaryProperties.parentSummaryBuilder = parentSummaryBuilder;
				trackedSummaryProperties.chunkSummaryPath.pop();
			}

			// Get the parent reference ID from the current chunk summary path.
			// For the root of the forest tree, the parent reference ID is undefined.
			// For all other chunks, the parent reference ID is the last element in the current chunk summary path.
			const chunkSummaryPathLength = trackedSummaryProperties.chunkSummaryPath.length;
			const parentReferenceId: ChunkReferenceId | undefined =
				chunkSummaryPathLength > 0
					? trackedSummaryProperties.chunkSummaryPath[chunkSummaryPathLength - 1]
					: undefined;
			setInNestedMap(
				this.chunkTrackingPropertiesMap,
				trackedSummaryProperties.summarySequenceNumber,
				chunk,
				{ referenceId: chunkReferenceId, parentReferenceId },
			);
			chunkReferenceIds.push(chunkReferenceId);
		}
		return chunkReferenceIds;
	}

	/**
	 * Must be called after summary generation is complete to finish tracking the summary.
	 * It clears any tracking state and deletes the tracking properties for summaries that are older than the
	 * latest successful summary.
	 * @param incrementalSummaryContext - The context for the incremental summary that contains the sequence numbers.
	 * If this is undefined, the summary tree will only contain a summary blob for `forestSummaryRootContent`.
	 * @param forestSummaryRootContent - The stringified ForestCodec output of top-level Forest content.
	 * @param forestSummaryRootContentKey - The key to use for the blob containing `forestSummaryRootContent`.
	 * @param builder - The summary tree builder to use to add the forest's contents. Note that if tracking an incremental
	 * summary, this builder will be the same as the one tracked in `trackedSummaryProperties`.
	 * @returns the Forest's summary tree.
	 */
	public completeSummary(args: {
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined;
		forestSummaryRootContent: string;
		forestSummaryRootContentKey: string;
		builder: SummaryTreeBuilder;
	}): void {
		const {
			incrementalSummaryContext,
			forestSummaryRootContent,
			forestSummaryRootContentKey,
			builder,
		} = args;
		if (!this.enableIncrementalSummary || incrementalSummaryContext === undefined) {
			builder.addBlob(forestSummaryRootContentKey, forestSummaryRootContent);
			return;
		}

		const trackedSummaryProperties = this.requireTrackingSummary();

		builder.addBlob(forestSummaryRootContentKey, forestSummaryRootContent);

		// Copy over the entries from the latest summary to the current summary.
		// In the current summary, there can be fields that haven't changed since the latest summary and the chunks
		// in these fields and in any of its children weren't encoded. So, we need get the entries for these chunks
		// to be able to incrementally summarize them in the next summary.
		const latestSummaryTrackingMap = this.chunkTrackingPropertiesMap.get(
			this.latestSummarySequenceNumber,
		);
		const currentSummaryTrackingMap = this.chunkTrackingPropertiesMap.get(
			trackedSummaryProperties.summarySequenceNumber,
		);
		if (latestSummaryTrackingMap !== undefined && currentSummaryTrackingMap !== undefined) {
			for (const [chunk, chunkProperties] of latestSummaryTrackingMap.entries()) {
				if (!currentSummaryTrackingMap.has(chunk)) {
					currentSummaryTrackingMap.set(chunk, chunkProperties);
				}
			}
		}

		// Delete tracking for summaries that are older than the latest successful summary because they will
		// never be referenced again for generating summary handles.
		for (const sequenceNumber of this.chunkTrackingPropertiesMap.keys()) {
			if (sequenceNumber < this.latestSummarySequenceNumber) {
				this.chunkTrackingPropertiesMap.delete(sequenceNumber);
			}
		}

		this.trackedSummaryProperties = undefined;
	}

	/**
	 * {@link IncrementalEncoder.decodeIncrementalChunk}
	 */
	public decodeIncrementalChunk(
		referenceId: ChunkReferenceId,
		chunkDecoder: (encoded: EncodedFieldBatchV2) => TreeChunk,
	): TreeChunk {
		const chunkLoadProperties = this.loadedChunksMap.get(`${referenceId}`);
		assert(chunkLoadProperties !== undefined, 0xc86 /* Encoded incremental chunk not found */);
		const chunk = chunkDecoder(chunkLoadProperties.encodedContents);

		// Account for the reference about to be added in `chunkTrackingPropertiesMap`
		// to ensure that no other users of this chunk think they have unique ownership.
		// This prevents prevent whoever this chunk is returned to from modifying it in-place.
		chunk.referenceAdded();
		// Track the decoded chunk. This will recreate the tracking state when the summary that this client
		// is loaded from was generated. This is needed to ensure that incremental summaries work correctly
		// when a new client starts to summarize.
		setInNestedMap(this.chunkTrackingPropertiesMap, this.initialSequenceNumber, chunk, {
			referenceId,
			parentReferenceId: chunkLoadProperties.parentReferenceId,
		});
		return chunk;
	}
}
