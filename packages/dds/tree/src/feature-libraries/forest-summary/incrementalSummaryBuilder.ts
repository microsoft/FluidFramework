/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import {
	brand,
	setInNestedMap,
	tryGetFromNestedMap,
	type JsonCompatible,
	type NestedMap,
} from "../../util/index.js";
import type {
	ChunkReferenceId,
	EncodedFieldBatch,
	IncrementalEncoderDecoder,
	TreeChunk,
} from "../chunked-forest/index.js";
import type {
	FieldKey,
	ITreeCursorSynchronous,
	TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

/**
 * The contents of an incremental chunk is under a summary tree node with its {@link ChunkReferenceId} as the key.
 * The inline portion of the chunk content is encoded with the forest codec is stored in a blob with this key.
 * The rest of the chunk contents  is stored in the summary tree under the summary tree node.
 * See the summary format in {@link ForestIncrementalSummaryBuilder} for more details.
 */
const chunkContentsBlobKey = "contents";

/**
 * State that tells whether a summary is currently being tracked.
 */
export const ForestSummaryTrackingState = {
	/** A summary is currently being tracked. */
	Tracking: "Tracking",
	/** A summary is ready to be tracked. */
	ReadyToTrack: "ReadyToTrack",
} as const;
export type ForestSummaryTrackingState =
	(typeof ForestSummaryTrackingState)[keyof typeof ForestSummaryTrackingState];

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
	 * The path for this chunk's summary in the summary tree relative to the forest's summary tree.
	 * This path is used to generate a summary handle for the chunk if it doesn't change between summaries.
	 */
	readonly summaryPath: string;
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
}

/**
 * Indicates whether the forest should summarize incrementally.
 * If true, the forest may encode some chunks incrementally, i.e., chunks that support incremental encoding will
 * be encoded separately. They will be added to a separate tree than the main summary blob in the summary.
 * If false, the forest will summarize all chunks in the main summary blob.
 */
export type ShouldSummarizeIncrementally = boolean;

/**
 * Validates that a summary is currently being tracked and that the tracked summary properties are defined.
 * @param forestSummaryState - The current state of the forest summary tracking.
 * @param trackedSummaryProperties - The properties of the tracked summary, which must be available.
 */
function validateTrackingSummary(
	forestSummaryState: ForestSummaryTrackingState,
	trackedSummaryProperties: TrackedSummaryProperties | undefined,
): asserts trackedSummaryProperties is TrackedSummaryProperties {
	assert(
		forestSummaryState === ForestSummaryTrackingState.Tracking,
		"Summary tracking must be in progress",
	);
	assert(
		trackedSummaryProperties !== undefined,
		"Tracked summary properties must be available when tracking a summary",
	);
}

/**
 * Validates that a summary is ready to be tracked and that the tracked summary properties are undefined.
 * @param forestSummaryState - The current state of the forest summary tracking.
 * @param trackedSummaryProperties - The properties of the tracked summary, which must be undefined.
 */
function validateReadyToTrackSummary(
	forestSummaryState: ForestSummaryTrackingState,
	trackedSummaryProperties: TrackedSummaryProperties | undefined,
): asserts trackedSummaryProperties is undefined {
	assert(
		forestSummaryState === ForestSummaryTrackingState.ReadyToTrack,
		"Summary tracking must be ready",
	);
	assert(
		trackedSummaryProperties === undefined,
		"Tracked summary properties must not be available when ready to track",
	);
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
 *     ├── ForestTree
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
 *   - The inline portion of the top-level forest content is stored in a summary blob called "ForestTree".
 *     It also contains the {@link ChunkReferenceId}s of the incremental chunks under it.
 *   - The summary for each incremental chunk under it is stored against its {@link ChunkReferenceId}.
 * - For each chunk, the structure of the summary tree is the same as the Forest. It contains the following:
 *   - The inline portion of the chunk content is stored in a blob called "contents".
 *     It also contains the {@link ChunkReferenceId}s of the incremental chunks under it.
 *   - The summary for each incremental chunk under it is stored against its {@link ChunkReferenceId}.
 * - Chunks that do not change between summaries are summarized as handles in the summary tree.
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
	 */
	private readonly chunkTrackingPropertiesMap: NestedMap<
		number,
		TreeChunk,
		ChunkSummaryProperties
	> = new Map();

	/**
	 * The state indicating whether a summary is currently being tracked or not.
	 */
	public forestSummaryState: ForestSummaryTrackingState =
		ForestSummaryTrackingState.ReadyToTrack;

	/**
	 * The sequence number of the latest summary that was successful.
	 */
	private latestSummarySequenceNumber: number = -1;

	/**
	 * The current state of the summary being tracked.
	 * This is undefined if no summary is currently being tracked.
	 */
	private trackedSummaryProperties: TrackedSummaryProperties | undefined;

	/**
	 * A map of chunk reference IDs to their encoded contents. This is typically used during the loading of the
	 * forest to retrieve the contents of the chunks that were summarized incrementally.
	 */
	private readonly encodedChunkContentsMap: Map<string, EncodedFieldBatch> = new Map();

	public constructor(
		private readonly enableIncrementalSummary: boolean,
		private readonly getChunkAtCursor: (cursor: ITreeCursorSynchronous) => TreeChunk,
		/**
		 * {@link IncrementalEncoder.shouldEncodeFieldIncrementally}
		 */
		public readonly shouldEncodeFieldIncrementally: (
			nodeIdentifier: TreeNodeSchemaIdentifier,
			fieldKey: FieldKey,
		) => boolean,
	) {}

	/**
	 * Must be called when the forest is loaded to download the encoded contents of incremental chunks.
	 * @param services - The channel storage service to use to access the snapshot tree and download the
	 * contents of the chunks.
	 * @param readAndParse - A function that reads and parses a blob from the storage service.
	 */
	public async load(
		services: IChannelStorageService,
		readAndParseChunk: <T extends JsonCompatible<IFluidHandle>>(id: string) => Promise<T>,
	): Promise<void> {
		const forestTree = services.getSnapshotTree?.();
		// Snapshot tree should be available when loading forest's contents. However, it is an optional function
		// and may not be implemented by the storage service.
		if (forestTree === undefined) {
			return;
		}

		// Downloads the contents of incremental chunks in the given snapshot tree. Also, recursively downloads
		// the contents of incremental chunks in any sub-trees.
		const downloadChunkContentsInTree = async (
			snapshotTree: ISnapshotTree,
			parentTreeKey: string,
		): Promise<void> => {
			// All trees in the snapshot tree are for incremental chunks. The key is the chunk's reference ID
			// and the value is the snapshot tree for the chunk.
			for (const [chunkReferenceId, chunkSnapshotTree] of Object.entries(snapshotTree.trees)) {
				const chunkSubTreePath = `${parentTreeKey}${chunkReferenceId}`;
				const chunkContentsPath = `${chunkSubTreePath}/${chunkContentsBlobKey}`;
				if (!(await services.contains(chunkContentsPath))) {
					throw new LoggingError(
						`SharedTree: Cannot find contents for incremental chunk ${chunkContentsPath}`,
					);
				}
				const chunkContents = await readAndParseChunk<EncodedFieldBatch>(chunkContentsPath);
				this.encodedChunkContentsMap.set(chunkReferenceId, chunkContents);

				// Recursively download the contents of chunks in this chunk's sub tree.
				await downloadChunkContentsInTree(chunkSnapshotTree, `${chunkSubTreePath}/`);
			}
		};
		await downloadChunkContentsInTree(forestTree, "");
	}

	/**
	 * Must be called when starting a new forest summary to track it.
	 * @param summaryBuilder - The summary builder to use to build the incremental summary tree.
	 * @param fullTree - Whether the summary is a full tree summary. If true, the summary will not contain
	 * any summary handles. All chunks must be summarized in full.
	 * @param incrementalSummaryContext - The context for the incremental summary that contains the sequence numbers
	 * for the current and latest summaries.
	 * @returns whether the forest data should be summarized incrementally.
	 */
	public startingSummary(
		summaryBuilder: SummaryTreeBuilder,
		fullTree: boolean,
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined,
	): ShouldSummarizeIncrementally {
		// If there is no incremental summary context, do not summarize incrementally. This happens in two scenarios:
		// 1. When summarizing a detached container, i.e., the first ever summary.
		// 2. When running GC, the default behavior is to call summarize on DDS without incrementalSummaryContext.
		if (!this.enableIncrementalSummary || incrementalSummaryContext === undefined) {
			return false;
		}

		validateReadyToTrackSummary(this.forestSummaryState, this.trackedSummaryProperties);

		this.forestSummaryState = ForestSummaryTrackingState.Tracking;
		this.latestSummarySequenceNumber = incrementalSummaryContext.latestSummarySequenceNumber;
		this.trackedSummaryProperties = {
			summarySequenceNumber: incrementalSummaryContext.summarySequenceNumber,
			latestSummaryBasePath: incrementalSummaryContext.summaryPath,
			chunkSummaryPath: [],
			parentSummaryBuilder: summaryBuilder,
			fullTree,
		};
		return true;
	}

	/**
	 * {@link IncrementalEncoder.encodeIncrementalField}
	 * @remarks Returns an empty array if the field has no content.
	 */
	public encodeIncrementalField(
		cursor: ITreeCursorSynchronous,
		chunkEncoder: (chunk: TreeChunk) => EncodedFieldBatch,
	): ChunkReferenceId[] {
		// Validate that a summary is currently being tracked and that the tracked summary properties are defined.
		validateTrackingSummary(this.forestSummaryState, this.trackedSummaryProperties);

		if (cursor.getFieldLength() === 0) {
			return [];
		}

		let chunkReferenceId: ChunkReferenceId;
		let chunkProperties: ChunkSummaryProperties;

		const chunk = this.getChunkAtCursor(cursor);

		// Try and get the properties of the chunk from the latest successful summary.
		// If it exists and the summary is not a full tree, use the properties to generate a summary handle.
		// If it does not exist, encode the chunk and generate new properties for it.
		const previousChunkProperties = tryGetFromNestedMap(
			this.chunkTrackingPropertiesMap,
			this.latestSummarySequenceNumber,
			chunk,
		);
		if (previousChunkProperties !== undefined && !this.trackedSummaryProperties.fullTree) {
			chunkProperties = previousChunkProperties;
			chunkReferenceId = previousChunkProperties.referenceId;
			this.trackedSummaryProperties.parentSummaryBuilder.addHandle(
				`${chunkReferenceId}`,
				SummaryType.Tree,
				`${this.trackedSummaryProperties.latestSummaryBasePath}/${previousChunkProperties.summaryPath}`,
			);
		} else {
			// Generate a new reference ID for the chunk.
			chunkReferenceId = brand(this.nextReferenceId++);
			// Add the reference ID of this chunk to the chunk summary path and use the path as the summary path
			// for the chunk in its summary properties.
			// This is done before encoding the chunk so that the summary path is updated correctly when encoding
			// any incremental chunks that are under this chunk.
			this.trackedSummaryProperties.chunkSummaryPath.push(chunkReferenceId);

			chunkProperties = {
				referenceId: chunkReferenceId,
				summaryPath: this.trackedSummaryProperties.chunkSummaryPath.join("/"),
			};

			const parentSummaryBuilder = this.trackedSummaryProperties.parentSummaryBuilder;
			// Create a new summary builder for this chunk to build its summary tree which will be stored in the
			// parent's summary tree under its reference ID.
			// Before encoding the chunk, set the parent summary builder to this chunk's summary builder so that
			// any incremental chunks in the subtree of this chunk will use that as their parent summary builder.
			const chunkSummaryBuilder = new SummaryTreeBuilder();
			this.trackedSummaryProperties.parentSummaryBuilder = chunkSummaryBuilder;
			chunkSummaryBuilder.addBlob(chunkContentsBlobKey, JSON.stringify(chunkEncoder(chunk)));

			// Add this chunk's summary tree to the parent's summary tree. The summary tree contains its encoded
			// contents and the summary trees of any incremental chunks under it.
			parentSummaryBuilder.addWithStats(
				`${chunkReferenceId}`,
				chunkSummaryBuilder.getSummaryTree(),
			);

			// Restore the parent summary builder and chunk summary path.
			this.trackedSummaryProperties.parentSummaryBuilder = parentSummaryBuilder;
			this.trackedSummaryProperties.chunkSummaryPath.pop();
		}

		setInNestedMap(
			this.chunkTrackingPropertiesMap,
			this.trackedSummaryProperties.summarySequenceNumber,
			chunk,
			chunkProperties,
		);
		return [chunkReferenceId];
	}

	/**
	 * Must be called after summary generation is complete to finish tracking the summary.
	 * It clears any tracking state and deletes the tracking properties for summaries that are older than the
	 * latest successful summary.
	 * @param incrementalSummaryContext - The context for the incremental summary that contains the sequence numbers
	 * for the current and latest summaries.
	 */
	public completedSummary(
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined,
	): void {
		if (!this.enableIncrementalSummary || incrementalSummaryContext === undefined) {
			return;
		}

		validateTrackingSummary(this.forestSummaryState, this.trackedSummaryProperties);

		// Copy over the entries from the latest summary to the current summary.
		// In the current summary, there can be fields that haven't changed since the latest summary and the chunks
		// in these fields and in any of its children weren't encoded. So, we need get the entries for these chunks
		// to be able to incrementally summarize them in the next summary.
		const latestSummaryTrackingMap = this.chunkTrackingPropertiesMap.get(
			this.latestSummarySequenceNumber,
		);
		const currentSummaryTrackingMap = this.chunkTrackingPropertiesMap.get(
			this.trackedSummaryProperties.summarySequenceNumber,
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

		this.forestSummaryState = ForestSummaryTrackingState.ReadyToTrack;
		this.trackedSummaryProperties = undefined;
	}

	/**
	 * Called to get the encoded contents of an incremental chunk with the given reference ID.
	 * This is typically used when loading the forest to retrieve the contents of incremental chunks.
	 * @param referenceId - The reference ID of the chunk to retrieve.
	 * @returns The encoded contents of the chunk.
	 */
	public getEncodedIncrementalChunk(referenceId: ChunkReferenceId): EncodedFieldBatch {
		const chunkEncodedContents = this.encodedChunkContentsMap.get(`${referenceId}`);
		assert(chunkEncodedContents !== undefined, "Incremental chunk contents not found");
		return chunkEncodedContents;
	}
}
