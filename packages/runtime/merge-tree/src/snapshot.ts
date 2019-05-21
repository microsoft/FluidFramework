import { FileMode, ITree, TreeEntry } from "@prague/container-definitions";
import { IObjectStorageService } from "@prague/runtime-definitions";
import * as assert from "assert";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";

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

    constructor(public mergeTree: MergeTree.MergeTree, public filename?: string,
        public onCompletion?: () => void) {
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

    emit(): ITree {
        let chunk1 = this.getSeqLengthSegs(this.segments, this.segmentLengths, Snapshot.sizeOfFirstChunk);
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: "header",
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(chunk1),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

        assert(chunk1.chunkSegmentCount <= chunk1.totalSegmentCount);
        if (chunk1.chunkSegmentCount < chunk1.totalSegmentCount)
        {
            assert(chunk1.chunkLengthChars < chunk1.totalLengthChars);
            let chunk2 = this.getSeqLengthSegs(this.segments, this.segmentLengths, chunk1.totalLengthChars, chunk1.chunkSegmentCount);
            tree.entries.push({
                mode: FileMode.File,
                path: "body",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(chunk2),
                    encoding: "utf-8",
                },
            });
        }

        return tree;
    }

    extractSync() {
        let collabWindow = this.mergeTree.getCollabWindow();
        this.seq = collabWindow.minSeq;
        this.header = {
            segmentsTotalLength: this.mergeTree.getLength(this.mergeTree.collabWindow.minSeq,
                MergeTree.NonCollabClient),
            seq: this.mergeTree.collabWindow.minSeq,
        };
        let segs = <ops.IJSONSegment[]>[];
        let segLengths = <number[]> [];
        let extractSegment = (segment: MergeTree.ISegment, pos: number, refSeq: number, clientId: number,
            start: number, end: number) => {
            if ((segment.seq != MergeTree.UnassignedSequenceNumber) && (segment.seq <= this.seq) &&
                ((segment.removedSeq === undefined) || (segment.removedSeq == MergeTree.UnassignedSequenceNumber) ||
                    (segment.removedSeq > this.seq))) {
                segs.push(segment.toJSONObject());
                segLengths.push(segment.cachedLength);
            }
            return true;
        }
        this.mergeTree.map({ leaf: extractSegment }, this.seq, MergeTree.NonCollabClient);
        this.segments = segs;
        this.segmentLengths = segLengths;
        return segs;
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
