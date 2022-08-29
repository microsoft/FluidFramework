/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidSerializer } from "@fluidframework/shared-object-base";
import { assert, bufferToString } from "@fluidframework/common-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { UnassignedSequenceNumber } from "./constants";
import {
    ISegment,
} from "./mergeTreeNodes";
import {
    matchProperties,
    PropertySet,
} from "./properties";
import {
    IJSONSegmentWithMergeInfo,
    JsonSegmentSpecs,
    MergeTreeHeaderMetadata,
    MergeTreeChunkV1,
    toLatestVersion,
    serializeAsMaxSupportedVersion,
} from "./snapshotChunks";
import { SnapshotLegacy } from "./snapshotlegacy";
import { MergeTree } from "./mergeTree";

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
    private readonly logger: ITelemetryLogger;
    private readonly chunkSize: number;

    constructor(
        public mergeTree: MergeTree,
        logger: ITelemetryLogger,
        private readonly getLongClientId: (id: number) => string,
        public filename?: string,
        public onCompletion?: () => void,
    ) {
        this.logger = ChildLogger.create(logger, "Snapshot");
        this.chunkSize = mergeTree?.options?.mergeTreeSnapshotChunkSize ?? SnapshotV1.chunkSize;

        const { currentSeq, minSeq } = mergeTree.getCollabWindow();
        this.header = {
            minSequenceNumber: minSeq,
            sequenceNumber: currentSeq,
            orderedChunkMetadata: [],
            totalLength: 0,
            totalSegmentCount: 0,
        };

        this.segments = [];
        this.segmentLengths = [];
    }

    private getSeqLengthSegs(
        allSegments: JsonSegmentSpecs[],
        allLengths: number[],
        approxSequenceLength: number,
        startIndex = 0): MergeTreeChunkV1 {
        const segments: JsonSegmentSpecs[] = [];
        let length = 0;
        let segmentCount = 0;
        while ((length < approxSequenceLength) && ((startIndex + segmentCount) < allSegments.length)) {
            const pseg = allSegments[startIndex + segmentCount];
            segments.push(pseg);
            length += allLengths[startIndex + segmentCount];
            segmentCount++;
        }
        return {
            version: "1",
            segmentCount,
            length,
            segments,
            startIndex,
            headerMetadata: undefined,
        };
    }

    /**
     * Emits the snapshot to an ISummarizeResult. If provided the optional IFluidSerializer will be used when
     * serializing the summary data rather than JSON.stringify.
     */
    emit(
        serializer: IFluidSerializer,
        bind: IFluidHandle,
    ): ISummaryTreeWithStats {
        const chunks: MergeTreeChunkV1[] = [];
        this.header.totalSegmentCount = 0;
        this.header.totalLength = 0;
        do {
            const chunk = this.getSeqLengthSegs(
                this.segments,
                this.segmentLengths,
                this.chunkSize,
                this.header.totalSegmentCount);
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
        chunks.forEach((chunk, index) => {
            const id = `${SnapshotLegacy.body}_${index}`;
            this.header.orderedChunkMetadata.push({ id });
            blobs.push([id, serializeAsMaxSupportedVersion(
                id,
                chunk,
                this.logger,
                this.mergeTree.options,
                serializer,
                bind)]);
        });

        const builder = new SummaryTreeBuilder();
        builder.addBlob(SnapshotLegacy.header, serializeAsMaxSupportedVersion(
            SnapshotLegacy.header,
            headerChunk,
            this.logger,
            this.mergeTree.options,
            serializer,
            bind));
        blobs.forEach((value) => {
            builder.addBlob(value[0], value[1]);
        });

        return builder.getSummaryTree();
    }

    extractSync() {
        const mergeTree = this.mergeTree;
        const minSeq = this.header.minSequenceNumber;

        // Helper to add the given `MergeTreeChunkV0SegmentSpec` to the snapshot.
        const pushSegRaw = (json: JsonSegmentSpecs, length: number) => {
            this.segments.push(json);
            this.segmentLengths.push(length);
        };

        // Helper to serialize the given `segment` and add it to the snapshot (if a segment is provided).
        const pushSeg = (segment?: ISegment) => {
            if (segment) { pushSegRaw(segment.toJSONObject(), segment.cachedLength); }
        };

        let prev: ISegment | undefined;
        const extractSegment = (segment: ISegment) => {
            // Elide segments that do not need to be included in the snapshot.  A segment may be elided if
            // either condition is true:
            //   a) The segment has not yet been ACKed.  We do not need to snapshot unACKed segments because
            //      there is a pending insert op that will deliver the segment on reconnection.
            //   b) The segment was removed at or below the MSN.  Pending ops can no longer reference this
            //      segment, and therefore we can discard it.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (segment.seq === UnassignedSequenceNumber || segment.removedSeq! <= minSeq) {
                return true;
            }

            // Next determine if the snapshot needs to preserve information required for merging the segment
            // (seq, client, etc.)  This information is only needed if the segment is above the MSN (and doesn't
            // have a pending remove.)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if ((segment.seq! <= minSeq)                                   // Segment is below the MSN, and...
                && (segment.removedSeq === undefined                      // .. Segment has not been removed, or...
                    || segment.removedSeq === UnassignedSequenceNumber)   // .. Removal op to be delivered on reconnect
            ) {
                // This segment is below the MSN, which means that future ops will not reference it.  Attempt to
                // coalesce the new segment with the previous (if any).
                if (!prev) {
                    // We do not have a previous candidate for coalescing.  Make the current segment the new candidate.
                    prev = segment;
                } else if (prev.canAppend(segment) && matchProperties(prev.properties, segment.properties)) {
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

                const raw: IJSONSegmentWithMergeInfo = { json: segment.toJSONObject() };
                // If the segment insertion is above the MSN, record the insertion merge info.
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (segment.seq! > minSeq) {
                    raw.seq = segment.seq;
                    raw.client = this.getLongClientId(segment.clientId);
                }
                // We have already dispensed with removed segments below the MSN and removed segments with unassigned
                // sequence numbers.  Any remaining removal info should be preserved.
                if (segment.removedSeq !== undefined) {
                    assert(segment.removedSeq !== UnassignedSequenceNumber && segment.removedSeq > minSeq,
                        0x065 /* "On removal info preservation, segment has invalid removed sequence number!" */);
                    raw.removedSeq = segment.removedSeq;

                    // back compat for when we split overlap and removed client
                    raw.removedClient =
                        segment.removedClientIds !== undefined
                            ? this.getLongClientId(segment.removedClientIds[0])
                            : undefined;

                    raw.removedClientIds = segment.removedClientIds?.map((id) => this.getLongClientId(id));
                }

            // Sanity check that we are preserving either the seq < minSeq or a removed segment's info.
                assert(raw.seq !== undefined && raw.client !== undefined
                    || raw.removedSeq !== undefined && raw.removedClient !== undefined,
                    0x066 /* "Corrupted preservation of segment metadata!" */);

                // Record the segment with it's required metadata.
                pushSegRaw(raw, segment.cachedLength);
            }
            return true;
        };

        mergeTree.walkAllSegments(mergeTree.root, extractSegment, this);

        // If the last segment in the walk was coalescable, push it now.
        pushSeg(prev);

        return this.segments;
    }

    public static async loadChunk(
        storage: IChannelStorageService,
        path: string,
        logger: ITelemetryLogger,
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
        logger: ITelemetryLogger,
        options: PropertySet | undefined,
        serializer?: IFluidSerializer,
    ): MergeTreeChunkV1 {
        const chunkObj = serializer ? serializer.parse(chunk) : JSON.parse(chunk);
        return toLatestVersion(path, chunkObj, logger, options);
    }
}
