/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@prague/container-definitions";
import { FileMode, ISequencedDocumentMessage, ITree, TreeEntry } from "@prague/protocol-definitions";
import { IObjectStorageService} from "@prague/runtime-definitions";
import { ChildLogger } from "@prague/utils";
import { NonCollabClient, UnassignedSequenceNumber } from "./constants";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";

// tslint:disable

interface SnapshotHeader {
    chunkCount?: number;
    segmentsTotalLength: number;
    indexOffset?: number;
    segmentsOffset?: number;
    seq: number;
}

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


export class Snapshot {

    public static readonly header = "header";
    public static readonly body = "body";
    public static readonly tardis = "tardis";

    // Split snapshot into two entries - headers (small) and body (overflow) for faster loading initial content
    // Please note that this number has no direct relationship to anything other than size of raw text (characters).
    // As we produce json for the blob (and then encode into base64 and send over the wire compressed), this number
    // is really hard to correlate with any actual metric that matters (like bytes over the wire).
    // For test with small number of chunks it would be closer to blob size (before base64 encoding), for very chunky text
    // blob size can easily be 4x-8x of that number.
    public static readonly sizeOfFirstChunk: number = 10000;

    header: SnapshotHeader;
    seq: number;
    buffer: Buffer;
    pendingChunk: SnapChunk;
    segments: ops.IJSONSegment[];
    segmentLengths: number[];
    logger: ITelemetryLogger;

    constructor(public mergeTree: MergeTree.MergeTree, logger: ITelemetryLogger, public filename?: string,
        public onCompletion?: () => void) {
        this.logger = ChildLogger.create(logger, "Snapshot");
    }

    getSeqLengthSegs(allSegments: ops.IJSONSegment[], allLengths: number[], approxSequenceLength: number,
        startIndex = 0): ops.MergeTreeChunk {

        let segs = <ops.IJSONSegment[]>[];
        let sequenceLength = 0;
        let segCount = 0;
        while ((sequenceLength < approxSequenceLength) && ((startIndex + segCount) < allSegments.length)) {
            let pseg = allSegments[startIndex + segCount];
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
            segmentTexts: segs
        }
    }

    emit(tardisMsgs: ISequencedDocumentMessage[]): ITree {
        let chunk1 = this.getSeqLengthSegs(this.segments, this.segmentLengths, Snapshot.sizeOfFirstChunk);
        let length: number = chunk1.chunkLengthChars;
        let segments: number = chunk1.chunkSegmentCount;
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: Snapshot.header,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(chunk1),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

        if (chunk1.chunkSegmentCount < chunk1.totalSegmentCount)
        {
            let chunk2 = this.getSeqLengthSegs(this.segments, this.segmentLengths, this.header.segmentsTotalLength, chunk1.chunkSegmentCount);
            length += chunk2.chunkLengthChars;
            segments += chunk2.chunkSegmentCount;
            tree.entries.push({
                mode: FileMode.File,
                path: Snapshot.body,
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(chunk2),
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
            path: Snapshot.tardis,
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(tardisMsgs),
                encoding: "utf-8",
            },
        });

        return tree;
    }

    extractSync() {
        let collabWindow = this.mergeTree.getCollabWindow();
        this.seq = collabWindow.minSeq;
        this.header = {
            segmentsTotalLength: this.mergeTree.getLength(this.mergeTree.collabWindow.minSeq,
                NonCollabClient),
            seq: this.mergeTree.collabWindow.minSeq,
        };

        const segs = <MergeTree.ISegment[]>[];
        let prev: MergeTree.ISegment | undefined;
        let extractSegment = (segment: MergeTree.ISegment, pos: number, refSeq: number, clientId: number,
            start: number, end: number) => {
            if ((segment.seq != UnassignedSequenceNumber) && (segment.seq <= this.seq) &&
                ((segment.removedSeq === undefined) || (segment.removedSeq == UnassignedSequenceNumber) ||
                    (segment.removedSeq > this.seq))) {
                if (prev && prev.canAppend(segment) && Properties.matchProperties(prev.properties, segment.properties)) {
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
        }

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
        // When this condition happens, we might not write out all segments in getSeqLengthSegs() when writing out "body"
        // Issue #1995 tracks following up on the core of the problem.
        // In the meantime, this code makes sure we will write out all segments properly
        if (this.header.segmentsTotalLength != totalLength) {
            this.logger.sendErrorEvent({eventName: "SegmentsTotalLengthMismatch", totalLength, segmentsTotalLength: this.header.segmentsTotalLength});
            this.header.segmentsTotalLength = totalLength;
        }

        return this.segments;
    }

    public static async loadChunk(storage: IObjectStorageService, path: string): Promise<ops.MergeTreeChunk> {
        let chunkAsString: string = await storage.read(path);
        return Snapshot.processChunk(chunkAsString);
    }

    public static EmptyChunk: ops.MergeTreeChunk = {
        chunkStartSegmentIndex: -1,
        chunkSegmentCount: -1,
        chunkLengthChars: -1,
        totalLengthChars: -1,
        totalSegmentCount: -1,
        chunkSequenceNumber: 0,
        segmentTexts: [],
    }

    public static processChunk(chunk: string): ops.MergeTreeChunk {
        return JSON.parse(Buffer.from(chunk, "base64").toString("utf-8")) as ops.MergeTreeChunk;
    }
}
