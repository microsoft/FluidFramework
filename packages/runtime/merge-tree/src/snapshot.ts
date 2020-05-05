/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentSerializer,
} from "@microsoft/fluid-component-core-interfaces";
import { ChildLogger, fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { FileMode, ISequencedDocumentMessage, ITree, TreeEntry } from "@microsoft/fluid-protocol-definitions";
import { IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { UnassignedSequenceNumber } from "./constants";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";
import { SnapshotLegacy } from "./snapshotlegacy";

type SegmentSpec = ops.IJSONSegment | ops.IJSONSegmentWithMergeInfo;

export interface SnapshotHeader {
    chunkCount?: number;
    segmentsTotalLength: number;
    indexOffset?: number;
    segmentsOffset?: number;
    seq: number;
    // TODO: Make 'minSeq' non-optional once the new snapshot format becomes the default?
    //       (See https://github.com/microsoft/FluidFramework/issues/84)
    minSeq?: number;
}

export class Snapshot {
    public static readonly header = "header";
    public static readonly body = "body";

    // Split snapshot into two entries - headers (small) and body (overflow) for faster loading initial content
    // Please note that this number has no direct relationship to anything other than size of raw text (characters).
    // As we produce json for the blob (and then encode into base64 and send over the wire compressed), this number
    // is really hard to correlate with any actual metric that matters (like bytes over the wire).
    // For test with small number of chunks it would be closer to blob size (before base64 encoding),
    // for very chunky text, blob size can easily be 4x-8x of that number.
    public static readonly sizeOfFirstChunk: number = 10000;

    private header: SnapshotHeader;
    private segments: SegmentSpec[];
    private segmentLengths: number[];
    private readonly logger: ITelemetryLogger;

    constructor(
        public mergeTree: MergeTree.MergeTree,
        logger: ITelemetryLogger,
        public filename?: string,
        public onCompletion?: () => void) {
        this.logger = ChildLogger.create(logger, "Snapshot");
    }

    getSeqLengthSegs(
        allSegments: SegmentSpec[],
        allLengths: number[],
        approxSequenceLength: number,
        startIndex = 0): ops.MergeTreeChunk {
        const segs: SegmentSpec[] = [];
        let sequenceLength = 0;
        let segCount = 0;
        while ((sequenceLength < approxSequenceLength) && ((startIndex + segCount) < allSegments.length)) {
            const pseg = allSegments[startIndex + segCount];
            segs.push(pseg);
            sequenceLength += allLengths[startIndex + segCount];
            segCount++;
        }
        return {
            chunkStartSegmentIndex: startIndex,
            chunkSegmentCount: segCount,
            chunkLengthChars: sequenceLength,
            totalLengthChars: this.header.segmentsTotalLength,
            totalSegmentCount: allSegments.length,
            chunkSequenceNumber: this.header.seq,
            chunkMinSequenceNumber: this.header.minSeq,
            segmentTexts: segs,
        };
    }

    /**
     * Emits the snapshot to an ITree. If provided the optional IComponentSerializer will be used when serializing
     * the summary data rather than JSON.stringify.
     */
    emit(
        // TODO: Remove unused 'tardisMsgs' argument once new snapshot format is the default.
        //       (See https://github.com/microsoft/FluidFramework/issues/84)
        tardisMsgs: ISequencedDocumentMessage[],
        serializer?: IComponentSerializer,
        context?: IComponentHandleContext,
        bind?: IComponentHandle,
    ): ITree {
        assert.equal(tardisMsgs.length, 0);

        // TODO: Remove or disable this timing data once Snapshot v2 becomes the default.  Right now,
        //       I leave it enabled to help identify when a client has successfully opted into v2.
        console.time("Snapshot.emit()");
        try {
            const chunk1 = this.getSeqLengthSegs(this.segments, this.segmentLengths, Snapshot.sizeOfFirstChunk);
            let length: number = chunk1.chunkLengthChars;
            let segments: number = chunk1.chunkSegmentCount;
            const tree: ITree = {
                entries: [
                    {
                        mode: FileMode.File,
                        path: Snapshot.header,
                        type: TreeEntry[TreeEntry.Blob],
                        value: {
                            contents: serializer ?
                                serializer.stringify(chunk1, context, bind) :
                                JSON.stringify(chunk1),
                            encoding: "utf-8",
                        },
                    },
                ],
                id: null,
            };

            if (chunk1.chunkSegmentCount < chunk1.totalSegmentCount) {
                const chunk2 = this.getSeqLengthSegs(this.segments, this.segmentLengths,
                    this.header.segmentsTotalLength, chunk1.chunkSegmentCount);
                length += chunk2.chunkLengthChars;
                segments += chunk2.chunkSegmentCount;
                tree.entries.push({
                    mode: FileMode.File,
                    path: Snapshot.body,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: serializer ? serializer.stringify(chunk2, context, bind) : JSON.stringify(chunk2),
                        encoding: "utf-8",
                    },
                });
            }

            this.logger.shipAssert(
                length === this.header.segmentsTotalLength,
                { eventName: "emit: mismatch in segmentsTotalLength" });

            this.logger.shipAssert(
                segments === chunk1.totalSegmentCount,
                { eventName: "emit: mismatch in totalSegmentCount" });

            // TODO: The 'Snapshot.tardis' tree entry is legacy now that the MergeTree snapshot includes all ACKed
            //       segments.  (See https://github.com/microsoft/FluidFramework/issues/84)
            tree.entries.push({
                mode: FileMode.File,
                path: SnapshotLegacy.tardis,
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: "[]",
                    encoding: "utf-8",
                },
            });

            return tree;
        } finally {
            console.timeEnd("Snapshot.emit()");
        }
    }

    extractSync() {
        const mergeTree = this.mergeTree;
        const { currentSeq, minSeq } = mergeTree.getCollabWindow();
        this.header = {
            segmentsTotalLength: 0,
            seq: currentSeq,
            minSeq,
        };

        this.segments = [];
        this.segmentLengths = [];

        // Helper to add the given `SegmentSpec` to the snapshot.
        const pushSegRaw = (json: SegmentSpec, length: number) => {
            this.header.segmentsTotalLength += length;
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

                const raw: ops.IJSONSegmentWithMergeInfo = { json: segment.toJSONObject() };
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
        storage: IObjectStorageService,
        path: string,
        serializer?: IComponentSerializer,
        context?: IComponentHandleContext,
    ): Promise<ops.MergeTreeChunk> {
        const chunkAsString: string = await storage.read(path);
        return Snapshot.processChunk(chunkAsString, serializer, context);
    }

    public static processChunk(
        chunk: string,
        serializer?: IComponentSerializer,
        context?: IComponentHandleContext,
    ): ops.MergeTreeChunk {
        const utf8 = fromBase64ToUtf8(chunk);
        return serializer ? serializer.parse(utf8, context) : JSON.parse(utf8);
    }
}
