/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidHandle,
    IFluidHandleContext,
    IFluidSerializer,
} from "@fluidframework/core-interfaces";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import {
    FileMode,
    ITree,
    TreeEntry,
    ITreeEntry,
} from "@fluidframework/protocol-definitions";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { UnassignedSequenceNumber } from "./constants";
import * as MergeTree from "./mergeTree";
import * as Properties from "./properties";
import {
    IJSONSegmentWithMergeInfo,
    JsonSegmentSpecs,
    MergeTreeHeaderMetadata,
    MergeTreeChunkV1,
    toLatestVersion,
    serializeAsMaxSupportedVersion,
} from "./snapshotChunks";
import { SnapshotLegacy } from "./snapshotlegacy";

export class SnapshotV1 {
    // Split snapshot into two entries - headers (small) and body (overflow) for faster loading initial content
    // Please note that this number has no direct relationship to anything other than size of raw text (characters).
    // As we produce json for the blob (and then encode into base64 and send over the wire compressed), this number
    // is really hard to correlate with any actual metric that matters (like bytes over the wire).
    // For test with small number of chunks it would be closer to blob size (before base64 encoding),
    // for very chunky text, blob size can easily be 4x-8x of that number.
    public static readonly chunkSize: number = 10000;

    private header: MergeTreeHeaderMetadata;
    private segments: JsonSegmentSpecs[];
    private segmentLengths: number[];
    private readonly logger: ITelemetryLogger;
    private readonly chunkSize: number;

    constructor(
        public mergeTree: MergeTree.MergeTree,
        logger: ITelemetryLogger,
        public filename?: string,
        public onCompletion?: () => void) {
        this.logger = ChildLogger.create(logger, "Snapshot");
        this.chunkSize = mergeTree?.options?.mergeTreeSnapshotChunkSize ?? SnapshotV1.chunkSize;
    }

    getSeqLengthSegs(
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
     * Emits the snapshot to an ITree. If provided the optional IFluidSerializer will be used when serializing
     * the summary data rather than JSON.stringify.
     */
    emit(
        serializer?: IFluidSerializer,
        context?: IFluidHandleContext,
        bind?: IFluidHandle,
    ): ITree {
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

        const headerChunk = chunks.shift();
        headerChunk.headerMetadata = this.header;
        headerChunk.headerMetadata.orderedChunkMetadata = [{ id: SnapshotLegacy.header }];
        const entries: ITreeEntry[] = chunks.map<ITreeEntry>((chunk, index) => {
            const id = `${SnapshotLegacy.body}_${index}`;
            this.header.orderedChunkMetadata.push({ id });
            return {
                mode: FileMode.File,
                path: id,
                type: TreeEntry.Blob,
                value: {
                    contents: serializeAsMaxSupportedVersion(
                        id,
                        chunk,
                        this.logger,
                        this.mergeTree.options,
                        serializer,
                        context,
                        bind),
                    encoding: "utf-8",
                },
            };
        });

        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: SnapshotLegacy.header,
                    type: TreeEntry.Blob,
                    value: {
                        contents: serializeAsMaxSupportedVersion(
                            SnapshotLegacy.header,
                            headerChunk,
                            this.logger,
                            this.mergeTree.options,
                            serializer,
                            context,
                            bind),
                        encoding: "utf-8",
                    },
                },
                ...entries,
            ],
            id: null,
        };

        return tree;
    }

    extractSync() {
        const mergeTree = this.mergeTree;
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

        // Helper to add the given `MergeTreeChunkV0SegmentSpec` to the snapshot.
        const pushSegRaw = (json: JsonSegmentSpecs, length: number) => {
            this.segments.push(json);
            this.segmentLengths.push(length);
        };

        // Helper to serialize the given `segment` and add it to the snapshot (if a segment is provided).
        const pushSeg = (segment?: MergeTree.ISegment) => {
            if (segment) { pushSegRaw(segment.toJSONObject(), segment.cachedLength); }
        };

        let prev: MergeTree.ISegment | undefined;
        const extractSegment = (segment: MergeTree.ISegment) => {
            // Elide segments that do not need to be included in the snapshot.  A segment may be elided if
            // either condition is true:
            //   a) The segment has not yet been ACKed.  We do not need to snapshot unACKed segments because
            //      there is a pending insert op that will deliver the segment on reconnection.
            //   b) The segment was removed at or below the MSN.  Pending ops can no longer reference this
            //      segment, and therefore we can discard it.
            if (segment.seq === UnassignedSequenceNumber || segment.removedSeq <= minSeq) {
                return true;
            }

            // Next determine if the snapshot needs to preserve information required for merging the segment
            // (seq, client, etc.)  This information is only needed if the segment is above the MSN (and doesn't
            // have a pending remove.)
            if ((segment.seq <= minSeq)                                   // Segment is below the MSN, and...
                && (segment.removedSeq === undefined                      // .. Segment has not been removed, or...
                    || segment.removedSeq === UnassignedSequenceNumber)   // .. Removal op to be delivered on reconnect
            ) {
                // This segment is below the MSN, which means that future ops will not reference it.  Attempt to
                // coalesce the new segment with the previous (if any).
                if (!prev) {
                    // We do not have a previous candidate for coalescing.  Make the current segment the new candidate.
                    prev = segment;
                } else if (prev.canAppend(segment) && Properties.matchProperties(prev.properties, segment.properties)) {
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
                // This segment needs to preserve it's metadata as it may be referenced by future ops.  It's ineligible
                // for coalescing, so emit the 'prev' segment now (if any).
                pushSeg(prev);
                prev = undefined;

                const raw: IJSONSegmentWithMergeInfo = { json: segment.toJSONObject() };
                // If the segment insertion is above the MSN, record the insertion merge info.
                if (segment.seq > minSeq) {
                    raw.seq = segment.seq;
                    raw.client = mergeTree.getLongClientId(segment.clientId);
                }
                // We have already dispensed with removed segments below the MSN and removed segments with unassigned
                // sequence numbers.  Any remaining removal info should be preserved.
                if (segment.removedSeq !== undefined) {
                    assert(segment.removedSeq !== UnassignedSequenceNumber && segment.removedSeq > minSeq);
                    raw.removedSeq = segment.removedSeq;
                    raw.removedClient = mergeTree.getLongClientId(segment.removedClientId);
                }

                // Sanity check that we are preserving either the seq < minSeq or a removed segment's info.
                assert(raw.seq !== undefined && raw.client !== undefined
                    || raw.removedSeq !== undefined && raw.removedClient !== undefined);

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
        options: Properties.PropertySet,
        serializer?: IFluidSerializer,
        context?: IFluidHandleContext,
    ): Promise<MergeTreeChunkV1> {
        const chunkAsString: string = await storage.read(path);
        return SnapshotV1.processChunk(path, chunkAsString, logger, options, serializer, context);
    }

    public static processChunk(
        path: string,
        chunk: string,
        logger: ITelemetryLogger,
        options: Properties.PropertySet,
        serializer?: IFluidSerializer,
        context?: IFluidHandleContext,
    ): MergeTreeChunkV1 {
        const utf8 = fromBase64ToUtf8(chunk);
        const chunkObj = serializer ? serializer.parse(utf8, context) : JSON.parse(utf8);
        return toLatestVersion(path, chunkObj, logger, options);
    }
}
