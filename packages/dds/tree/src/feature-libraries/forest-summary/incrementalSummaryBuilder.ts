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
	EncodedFieldBatch,
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
	readonly encodedContents: EncodedFieldBatch;
	/**
	 * The path for this chunk's contents in the summary tree relative to the forest's summary tree.
	 * This path is used to generate a summary handle for the chunk if it doesn't change between summaries.
	 */
	readonly summaryPath: string;
}

/**
 * The properties of a chunk that is tracked for every summary.
 * If a chunk doesn't change between summaries,
 * these properties can be used to generate a summary handle for the chunk.
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
 * The properties of a summary being tracked (aka encoded).
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
 * Remembers the chunks a forest was loaded from, allowing them to be reused when re-summarizing.
 * @remarks
 *
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
	 * The next {@link ChunkReferenceId} to use for a chunk.
	 * @remarks
	 * Because these are only used to refer to a specific child of a given chunk, these ids are only required to be unique withing a given chunk's set of child references.
	 * To simplify the implementation, this implementation uses a single counter across all chunks:
	 * changing to a more local scoping of the ids would allow slightly smaller sizes due to shorter ids being used, but such gains would be almost negligible.
	 */
	private nextReferenceId: ChunkReferenceId = brand(0);

	/**
	 * For a given summary sequence number, keeps track of a chunk's properties that will be used to generate
	 * a summary handle for the chunk if it does not change between summaries.
	 * @remarks
	 * This owns a refcount for all chunks that it includes which ensures they are not modified in place, and thus keeping their contents matching the referenced summary objects.
	 *
	 * Populated both when loading a summary (with the chunks that the summary was loaded from) and when summarizing (with the chunks that are being summarized).
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
	 * A map of chunk reference IDs to their {@link ChunkLoadProperties}.
	 * This is used during the loading of the forest to track each chunk that is retrieved and decoded.
	 */
	private readonly loadedChunksMap: Map<string, ChunkLoadProperties> = new Map();

	public constructor(
		/**
		 * Controls if incremental summaries will be written when possible.
		 * @remarks
		 * This has no impact on what is supported for decoding:
		 * decode will always support all known formats.
		 */
		private readonly enableIncrementalSummary: boolean,
		/**
		 * This callback injects the policy for how chunking should be done when encoding content.
		 * @remarks
		 * For reuse across summaries, this must return the same chunks that were produced by
		 * {@link decodeIncrementalChunk}'s chunkDecoder callback when decoding the summary that this client was loaded from.
		 */
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
			parentTreeKey: string,
		): Promise<void> => {
			// All trees in the snapshot tree are for incremental chunks. The key is the chunk's reference ID
			// and the value is the snapshot tree for the chunk.
			for (const [chunkReferenceId, chunkSnapshotTree] of Object.entries(snapshotTree.trees)) {
				const chunkSubTreePath = `${parentTreeKey}${chunkReferenceId}`;
				const chunkContentsPath = `${chunkSubTreePath}/${summaryContentBlobKey}`;
				if (!(await args.services.contains(chunkContentsPath))) {
					throw new LoggingError(
						`SharedTree: Cannot find contents for incremental chunk ${chunkContentsPath}`,
					);
				}
				const chunkContents = (await args.readAndParseChunk(
					chunkContentsPath,
				)) as EncodedFieldBatch; // TODO: this should use a codec to validate the data instead of just type casting.
				this.loadedChunksMap.set(chunkReferenceId, {
					encodedContents: chunkContents,
					summaryPath: chunkSubTreePath,
				});

				const chunkReferenceIdNumber = Number(chunkReferenceId);
				this.nextReferenceId = brand(
					Math.max(this.nextReferenceId, chunkReferenceIdNumber + 1),
				);

				// Recursively download the contents of chunks in this chunk's sub tree.
				await downloadChunkContentsInTree(chunkSnapshotTree, `${chunkSubTreePath}/`);
			}
		};
		await downloadChunkContentsInTree(forestTree, "");
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
		this.trackedSummaryProperties = {
			summarySequenceNumber: incrementalSummaryContext.summarySequenceNumber,
			latestSummaryBasePath: incrementalSummaryContext.summaryPath,
			chunkSummaryPath: [],
			parentSummaryBuilder: builder,
			fullTree,
			stringify,
		};
		return ForestIncrementalSummaryBehavior.Incremental;
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
		const trackedSummaryProperties = this.requireTrackingSummary();

		const chunkReferenceIds: ChunkReferenceId[] = [];
		const chunks = this.getChunkAtCursor(cursor);
		for (const chunk of chunks) {
			let chunkProperties: ChunkSummaryProperties;

			// Try and get the properties of the chunk from the latest successful summary.
			// If it exists and the summary is not a full tree, use the properties to generate a summary handle.
			// If it does not exist, encode the chunk and generate new properties for it.
			const previousChunkProperties = tryGetFromNestedMap(
				this.chunkTrackingPropertiesMap,
				this.latestSummarySequenceNumber,
				chunk,
			);
			if (previousChunkProperties !== undefined && !trackedSummaryProperties.fullTree) {
				chunkProperties = previousChunkProperties;
				trackedSummaryProperties.parentSummaryBuilder.addHandle(
					`${chunkProperties.referenceId}`,
					SummaryType.Tree,
					`${trackedSummaryProperties.latestSummaryBasePath}/${chunkProperties.summaryPath}`,
				);
			} else {
				// Generate a new reference ID for the chunk.
				const newReferenceId: ChunkReferenceId = brand(this.nextReferenceId++);

				// Add the reference ID of this chunk to the chunk summary path and use the path as the summary path
				// for the chunk in its summary properties.
				// This is done before encoding the chunk so that the summary path is updated correctly when encoding
				// any incremental chunks that are under this chunk.
				trackedSummaryProperties.chunkSummaryPath.push(newReferenceId);

				chunkProperties = {
					referenceId: newReferenceId,
					summaryPath: trackedSummaryProperties.chunkSummaryPath.join("/"),
				};

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

			// Currently Fluid's summary client won't every be created and used in a way that benefits from this,
			// but store it in case future versions can leverage it.
			// Currently Fluid it will only use content from the summary which was loaded (not a previously encoded one).
			setInNestedMap(
				this.chunkTrackingPropertiesMap,
				trackedSummaryProperties.summarySequenceNumber,
				chunk,
				chunkProperties,
			);
			chunkReferenceIds.push(chunkProperties.referenceId);
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
		chunkDecoder: (encoded: EncodedFieldBatch) => TreeChunk,
	): TreeChunk {
		const ChunkLoadProperties = this.loadedChunksMap.get(`${referenceId}`);
		assert(ChunkLoadProperties !== undefined, 0xc86 /* Encoded incremental chunk not found */);
		const chunk = chunkDecoder(ChunkLoadProperties.encodedContents);

		// Account for the reference about to be added in `chunkTrackingPropertiesMap`
		// to ensure that no other users of this chunk think they have unique ownership.
		// This prevents prevent whoever this chunk is returned to from modifying it in-place.
		chunk.referenceAdded();
		// Track the decoded chunk. This will recreate the tracking state when the summary that this client
		// is loaded from was generated. This is needed to enable chunk reuse if this client is used to write a summary.
		setInNestedMap(this.chunkTrackingPropertiesMap, this.initialSequenceNumber, chunk, {
			referenceId,
			summaryPath: ChunkLoadProperties.summaryPath,
		});
		return chunk;
	}
}
