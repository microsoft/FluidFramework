/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentSerializer,
} from "@microsoft/fluid-component-core-interfaces";
import { ChildLogger } from "@fluidframework/common-utils";
import { FileMode, ISequencedDocumentMessage, ITree, TreeEntry } from "@microsoft/fluid-protocol-definitions";
import { NonCollabClient, UnassignedSequenceNumber } from "./constants";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";
import {
    MergeTreeChunkLegacy,
    serializeAsMinSupportedVersion,
} from "./snapshotChunks";

// first three are index entry
export interface SnapChunk {
    /**
     * Offset from beginning of segments.
     */
    position: number;
    lengthBytes: number;
    sequenceLength: number;
    buffer?: Buffer;
}

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

export class SnapshotLegacy {
    public static readonly header = "header";
    public static readonly body = "body";
    public static readonly tardis = "tardis";

    // Split snapshot into two entries - headers (small) and body (overflow) for faster loading initial content
    // Please note that this number has no direct relationship to anything other than size of raw text (characters).
    // As we produce json for the blob (and then encode into base64 and send over the wire compressed), this number
    // is really hard to correlate with any actual metric that matters (like bytes over the wire).
    // For test with small number of chunks it would be closer to blob size (before base64 encoding),
    // for very chunky text, blob size can easily be 4x-8x of that number.
    public static readonly sizeOfFirstChunk: number = 10000;

    header: SnapshotHeader;
    seq: number;
    buffer: Buffer;
    pendingChunk: SnapChunk;
    segments: ops.IJSONSegment[];
    segmentLengths: number[];
    logger: ITelemetryLogger;

    constructor(public mergeTree: MergeTree.MergeTree, logger: ITelemetryLogger, public filename?: string,
        // eslint-disable-next-line @typescript-eslint/indent
        public onCompletion?: () => void) {
        this.logger = ChildLogger.create(logger, "Snapshot");
    }

    getSeqLengthSegs(
        allSegments: ops.IJSONSegment[],
        allLengths: number[],
        approxSequenceLength: number,
        startIndex = 0): MergeTreeChunkLegacy {
        const segs: ops.IJSONSegment[] = [];
        let sequenceLength = 0;
        let segCount = 0;
        while ((sequenceLength < approxSequenceLength) && ((startIndex + segCount) < allSegments.length)) {
            const pseg = allSegments[startIndex + segCount];
            segs.push(pseg);
            sequenceLength += allLengths[startIndex + segCount];
            segCount++;
        }
        return {
            version: undefined,
            chunkStartSegmentIndex: startIndex,
            chunkSegmentCount: segCount,
            chunkLengthChars: sequenceLength,
            totalLengthChars: this.header.segmentsTotalLength,
            totalSegmentCount: allSegments.length,
            chunkSequenceNumber: this.header.seq,
            segmentTexts: segs,
        };
    }

    /**
     * Emits the snapshot to an ITree. If provided the optional IComponentSerializer will be used when serializing
     * the summary data rather than JSON.stringify.
     */
    emit(
        tardisMsgs: ISequencedDocumentMessage[],
        serializer?: IComponentSerializer,
        context?: IComponentHandleContext,
        bind?: IComponentHandle,
    ): ITree {
        const chunk1 = this.getSeqLengthSegs(this.segments, this.segmentLengths, SnapshotLegacy.sizeOfFirstChunk);
        let length: number = chunk1.chunkLengthChars;
        let segments: number = chunk1.chunkSegmentCount;
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: SnapshotLegacy.header,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: serializeAsMinSupportedVersion(
                            SnapshotLegacy.header,
                            chunk1,
                            this.logger,
                            serializer,
                            context,
                            bind),
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
                path: SnapshotLegacy.body,
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: serializeAsMinSupportedVersion(
                        SnapshotLegacy.body,
                        chunk2,
                        this.logger,
                        serializer,
                        context,
                        bind),
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

        tree.entries.push({
            mode: FileMode.File,
            path: SnapshotLegacy.tardis,
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: serializer ? serializer.stringify(tardisMsgs, context, bind) : JSON.stringify(tardisMsgs),
                encoding: "utf-8",
            },
        });

        return tree;
    }

    extractSync() {
        const collabWindow = this.mergeTree.getCollabWindow();
        this.seq = collabWindow.minSeq;
        this.header = {
            segmentsTotalLength: this.mergeTree.getLength(this.mergeTree.collabWindow.minSeq,
                NonCollabClient),
            seq: this.mergeTree.collabWindow.minSeq,
        };

        const segs: MergeTree.ISegment[] = [];
        let prev: MergeTree.ISegment | undefined;
        const extractSegment =
            // eslint-disable-next-line max-len
            (segment: MergeTree.ISegment, pos: number, refSeq: number, clientId: number, start: number, end: number) => {
                // eslint-disable-next-line eqeqeq
                if ((segment.seq != UnassignedSequenceNumber) && (segment.seq <= this.seq) &&
                    // eslint-disable-next-line eqeqeq
                    ((segment.removedSeq === undefined) || (segment.removedSeq == UnassignedSequenceNumber) ||
                        (segment.removedSeq > this.seq))) {
                    if (prev && prev.canAppend(segment)
                        && Properties.matchProperties(prev.properties, segment.properties)
                    ) {
                        prev = prev.clone();
                        prev.append(segment.clone());
                    } else {
                        if (prev) {
                            segs.push(prev);
                        }
                        prev = segment;
                    }
                }
                return true;
            };

        this.mergeTree.map({ leaf: extractSegment }, this.seq, NonCollabClient);
        if (prev) {
            segs.push(prev);
        }

        this.segments = [];
        this.segmentLengths = [];
        let totalLength: number = 0;
        segs.map((segment) => {
            totalLength += segment.cachedLength;
            this.segments.push(segment.toJSONObject());
            this.segmentLengths.push(segment.cachedLength);
        });

        // We observed this.header.segmentsTotalLength < totalLength to happen in some cases
        // When this condition happens, we might not write out all segments in getSeqLengthSegs()
        // when writing out "body". Issue #1995 tracks following up on the core of the problem.
        // In the meantime, this code makes sure we will write out all segments properly
        // eslint-disable-next-line eqeqeq
        if (this.header.segmentsTotalLength != totalLength) {
            this.logger.sendErrorEvent({
                eventName: "SegmentsTotalLengthMismatch",
                totalLength,
                segmentsTotalLength: this.header.segmentsTotalLength,
            });
            this.header.segmentsTotalLength = totalLength;
        }

        return this.segments;
    }
}
