/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import {
	ISummaryTreeWithStats,
	AttributionKey,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	ITelemetryLoggerExt,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import { IAttributionCollection } from "./attributionCollection.js";
import { UnassignedSequenceNumber } from "./constants.js";
import { MergeTree } from "./mergeTree.js";
import { walkAllChildSegments } from "./mergeTreeNodeWalk.js";
import { ISegmentLeaf } from "./mergeTreeNodes.js";
import type { IJSONSegment } from "./ops.js";
import { PropertySet, matchProperties } from "./properties.js";
import { assertInsertionInfo } from "./segmentInfos.js";
import {
	IJSONSegmentWithMergeInfo,
	JsonSegmentSpecs,
	MergeTreeChunkV1,
	MergeTreeHeaderMetadata,
	serializeAsMaxSupportedVersion,
	toLatestVersion,
	type VersionedMergeTreeChunk,
} from "./snapshotChunks.js";
import { SnapshotLegacy } from "./snapshotlegacy.js";

export class SnapshotV1 {
	// Split snapshot into two entries - headers (small) and body (overflow) for faster loading initial content
	// Please note that this number has no direct relationship to anything other than size of raw text (characters).
	// As we produce json for the blob (and then send over the wire compressed), this number
	// is really hard to correlate with any actual metric that matters (like bytes over the wire).
	// For test with small number of chunks it would be closer to blob size,
	// for very chunky text, blob size can easily be 4x-8x of that number.
	public static readonly chunkSize: number = 10000;

	private readonly header: MergeTreeHeaderMetadata;
	private readonly segments: JsonSegmentSpecs[];
	private readonly segmentLengths: number[];
	private readonly attributionCollections: IAttributionCollection<AttributionKey>[];
	private readonly logger: ITelemetryLoggerExt;
	private readonly chunkSize: number;

	constructor(
		public mergeTree: MergeTree,
		logger: ITelemetryLoggerExt,
		private readonly getLongClientId: (id: number) => string,
		public filename?: string,
		public onCompletion?: () => void,
	) {
		this.logger = createChildLogger({ logger, namespace: "Snapshot" });
		this.chunkSize = mergeTree?.options?.mergeTreeSnapshotChunkSize ?? SnapshotV1.chunkSize;

		const { currentSeq, minSeq } = mergeTree.collabWindow;
		this.header = {
			minSequenceNumber: minSeq,
			sequenceNumber: currentSeq,
			orderedChunkMetadata: [],
			totalLength: 0,
			totalSegmentCount: 0,
		};

		this.segments = [];
		this.segmentLengths = [];
		this.attributionCollections = [];
	}

	private getSeqLengthSegs(
		allSegments: JsonSegmentSpecs[],
		allLengths: number[],
		attributionCollections: IAttributionCollection<AttributionKey>[],
		approxSequenceLength: number,
		startIndex = 0,
	): MergeTreeChunkV1 {
		const segments: JsonSegmentSpecs[] = [];
		const collections: {
			attribution: IAttributionCollection<AttributionKey>;
			cachedLength: number;
		}[] = [];
		let length = 0;
		let segmentCount = 0;
		let hasAttribution = false;
		while (length < approxSequenceLength && startIndex + segmentCount < allSegments.length) {
			const pseg = allSegments[startIndex + segmentCount];
			segments.push(pseg);
			length += allLengths[startIndex + segmentCount];
			if (attributionCollections[startIndex + segmentCount]) {
				hasAttribution = true;
				collections.push({
					attribution: attributionCollections[startIndex + segmentCount],
					cachedLength: allLengths[startIndex + segmentCount],
				});
			}
			segmentCount++;
		}

		const attributionSerializer = this.mergeTree.attributionPolicy?.serializer;
		assert(
			!hasAttribution || attributionSerializer !== undefined,
			0x55a /* attribution serializer must be provided when there are segments with attribution. */,
		);

		return {
			version: "1",
			segmentCount,
			length,
			segments,
			startIndex,
			headerMetadata: undefined,
			attribution: hasAttribution
				? attributionSerializer?.serializeAttributionCollections(collections)
				: undefined,
		};
	}

	/**
	 * Emits the snapshot to an ISummarizeResult. If provided the optional IFluidSerializer will be used when
	 * serializing the summary data rather than JSON.stringify.
	 */
	emit(serializer: IFluidSerializer, bind: IFluidHandle): ISummaryTreeWithStats {
		const chunks: MergeTreeChunkV1[] = [];
		this.header.totalSegmentCount = 0;
		this.header.totalLength = 0;
		do {
			const chunk = this.getSeqLengthSegs(
				this.segments,
				this.segmentLengths,
				this.attributionCollections,
				this.chunkSize,
				this.header.totalSegmentCount,
			);
			chunks.push(chunk);
			this.header.totalSegmentCount += chunk.segmentCount;
			this.header.totalLength += chunk.length;
		} while (this.header.totalSegmentCount < this.segments.length);

		// The do while loop should have added at least one chunk
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const headerChunk = chunks.shift()!;
		headerChunk.headerMetadata = this.header;
		headerChunk.headerMetadata.orderedChunkMetadata = [{ id: SnapshotLegacy.header }];
		const blobs: [key: string, content: string][] = [];
		for (const [index, chunk] of chunks.entries()) {
			const id = `${SnapshotLegacy.body}_${index}`;
			this.header.orderedChunkMetadata.push({ id });
			blobs.push([
				id,
				serializeAsMaxSupportedVersion(
					id,
					chunk,
					this.logger,
					this.mergeTree.options,
					serializer,
					bind,
				),
			]);
		}

		const builder = new SummaryTreeBuilder();
		builder.addBlob(
			SnapshotLegacy.header,
			serializeAsMaxSupportedVersion(
				SnapshotLegacy.header,
				headerChunk,
				this.logger,
				this.mergeTree.options,
				serializer,
				bind,
			),
		);
		for (const value of blobs) {
			builder.addBlob(value[0], value[1]);
		}

		return builder.getSummaryTree();
	}

	extractSync(): JsonSegmentSpecs[] {
		const mergeTree = this.mergeTree;
		const minSeq = this.header.minSequenceNumber;

		let originalSegments = 0;
		let segmentsAfterCombine = 0;

		// Helper to add the given `MergeTreeChunkV0SegmentSpec` to the snapshot.
		const pushSegRaw = (
			json: JsonSegmentSpecs,
			length: number,
			attribution: IAttributionCollection<AttributionKey> | undefined,
		): void => {
			segmentsAfterCombine += 1;
			this.segments.push(json);
			this.segmentLengths.push(length);
			if (attribution) {
				this.attributionCollections.push(attribution);
			}
		};

		// Helper to serialize the given `segment` and add it to the snapshot (if a segment is provided).
		const pushSeg = (segment?: ISegmentLeaf): void => {
			if (segment) {
				if (segment.properties !== undefined && Object.keys(segment.properties).length === 0) {
					segment.properties = undefined;
				}
				pushSegRaw(
					segment.toJSONObject() as JsonSegmentSpecs,
					segment.cachedLength,
					segment.attribution,
				);
			}
		};

		let prev: ISegmentLeaf | undefined;
		const extractSegment = (segment: ISegmentLeaf): boolean => {
			assertInsertionInfo(segment);
			// Elide segments that do not need to be included in the snapshot.  A segment may be elided if
			// either condition is true:
			//   a) The segment has not yet been ACKed.  We do not need to snapshot unACKed segments because
			//      there is a pending insert op that will deliver the segment on reconnection.
			//   b) The segment was removed at or below the MSN.  Pending ops can no longer reference this
			//      segment, and therefore we can discard it.
			if (
				segment.seq === UnassignedSequenceNumber ||
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				segment.removedSeq! <= minSeq ||
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				segment.movedSeq! <= minSeq
			) {
				if (segment.seq !== UnassignedSequenceNumber) {
					originalSegments += 1;
				}
				return true;
			}

			originalSegments += 1;

			// Next determine if the snapshot needs to preserve information required for merging the segment
			// (seq, client, etc.)  This information is only needed if the segment is above the MSN (and doesn't
			// have a pending remove.)
			if (
				segment.seq <= minSeq && // Segment is below the MSN, and...
				(segment.removedSeq === undefined || // .. Segment has not been removed, or...
					segment.removedSeq === UnassignedSequenceNumber) && // .. Removal op to be delivered on reconnect
				(segment.movedSeq === undefined || segment.movedSeq === UnassignedSequenceNumber)
			) {
				// This segment is below the MSN, which means that future ops will not reference it.  Attempt to
				// coalesce the new segment with the previous (if any).
				if (!prev) {
					// We do not have a previous candidate for coalescing.  Make the current segment the new candidate.
					prev = segment;
				} else if (
					prev.canAppend(segment) &&
					matchProperties(prev.properties, segment.properties)
				) {
					// We have a compatible pair.  Replace `prev` with the coalesced segment.  Clone to avoid
					// modifying the segment instances currently in the MergeTree.
					prev = prev.clone();
					prev.append(segment.clone());
				} else {
					// The segment pair could not be coalesced.  Record the `prev` segment in the snapshot
					// and make the current segment the new candidate for coalescing.
					pushSeg(prev);
					prev = segment;
				}
			} else {
				// This segment needs to preserve its metadata as it may be referenced by future ops.  It's ineligible
				// for coalescing, so emit the 'prev' segment now (if any).
				pushSeg(prev);
				prev = undefined;

				if (segment.properties !== undefined && Object.keys(segment.properties).length === 0) {
					segment.properties = undefined;
				}
				const raw: IJSONSegmentWithMergeInfo & { removedClient?: string } = {
					json: segment.toJSONObject() as IJSONSegment,
				};
				// If the segment insertion is above the MSN, record the insertion merge info.
				if (segment.seq > minSeq) {
					raw.seq = segment.seq;
					raw.client = this.getLongClientId(segment.clientId);
				}
				// We have already dispensed with removed segments below the MSN and removed segments with unassigned
				// sequence numbers.  Any remaining removal info should be preserved.
				if (segment.removedSeq !== undefined) {
					assert(
						segment.removedSeq !== UnassignedSequenceNumber && segment.removedSeq > minSeq,
						0x065 /* "On removal info preservation, segment has invalid removed sequence number!" */,
					);
					raw.removedSeq = segment.removedSeq;

					// back compat for when we split overlap and removed client
					raw.removedClient =
						segment.removedClientIds === undefined
							? undefined
							: this.getLongClientId(segment.removedClientIds[0]);

					raw.removedClientIds = segment.removedClientIds?.map((id) =>
						this.getLongClientId(id),
					);
				}

				if (segment.movedSeq !== undefined) {
					assert(
						segment.movedSeq !== UnassignedSequenceNumber && segment.movedSeq > minSeq,
						0x873 /* On move info preservation, segment has invalid moved sequence number! */,
					);
					raw.movedSeq = segment.movedSeq;
					raw.movedSeqs = segment.movedSeqs;
					raw.movedClientIds = segment.movedClientIds?.map((id) => this.getLongClientId(id));
				}

				// Sanity check that we are preserving either the seq > minSeq or a (re)moved segment's info.
				assert(
					(raw.seq !== undefined && raw.client !== undefined) ||
						(raw.removedSeq !== undefined && raw.removedClientIds !== undefined) ||
						(raw.movedSeq !== undefined &&
							raw.movedClientIds !== undefined &&
							raw.movedClientIds.length > 0 &&
							raw.movedSeqs !== undefined &&
							raw.movedSeqs.length > 0),
					0x066 /* "Corrupted preservation of segment metadata!" */,
				);

				// Record the segment with its required metadata.
				pushSegRaw(raw, segment.cachedLength, segment.attribution);
			}
			return true;
		};

		walkAllChildSegments(mergeTree.root, extractSegment);

		// If the last segment in the walk was coalescable, push it now.
		pushSeg(prev);

		// To reduce potential spam from this telemetry, we sample only a small
		// percentage of summaries
		if (Math.abs(originalSegments - segmentsAfterCombine) > 500 && Math.random() < 0.005) {
			this.logger.sendTelemetryEvent({
				eventName: "MergeTreeV1SummarizeSegmentCount",
				originalSegments,
				segmentsAfterCombine,
				segmentsLen: this.segments.length,
			});
		}

		return this.segments;
	}

	public static async loadChunk(
		storage: IChannelStorageService,
		path: string,
		logger: ITelemetryLoggerExt,
		options: PropertySet | undefined,
		serializer?: IFluidSerializer,
	): Promise<MergeTreeChunkV1> {
		const blob = await storage.readBlob(path);
		const chunkAsString = bufferToString(blob, "utf8");
		return SnapshotV1.processChunk(path, chunkAsString, logger, options, serializer);
	}

	public static processChunk(
		path: string,
		chunk: string,
		logger: ITelemetryLoggerExt,
		options: PropertySet | undefined,
		serializer?: IFluidSerializer,
	): MergeTreeChunkV1 {
		const chunkObj: VersionedMergeTreeChunk = serializer
			? (serializer.parse(chunk) as VersionedMergeTreeChunk)
			: (JSON.parse(chunk) as VersionedMergeTreeChunk);
		return toLatestVersion(path, chunkObj, logger, options);
	}
}
