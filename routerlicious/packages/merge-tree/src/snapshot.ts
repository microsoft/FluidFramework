import { FileMode, IObjectStorageService, ITree, TreeEntry } from "@prague/runtime-definitions";
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
    static SnapChunkMaxSize = 0x20000;
    static SegmentLengthSize = 0x4;
    static SnapshotHeaderSize = 0x14;

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
            segCount++;
            segs.push(pseg);
            sequenceLength += allLengths[startIndex + segCount];
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
        let chunk1 = this.getSeqLengthSegs(this.segments, this.segmentLengths, 10000);
        let chunk2 = this.getSeqLengthSegs(this.segments, this.segmentLengths, chunk1.totalLengthChars, chunk1.chunkSegmentCount);

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
                {
                    mode: FileMode.File,
                    path: "body",
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(chunk2),
                        encoding: "utf-8",
                    },
                },
            ],
        };

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
