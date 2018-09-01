import * as API from "../api-core";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";

// tslint:disable

export interface SnapshotHeader {
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
    lengthChars: number;
    buffer?: Buffer;
}

export class Snapshot {
    static SnapChunkMaxSize = 0x20000;
    static SegmentLengthSize = 0x4;
    static SnapshotHeaderSize = 0x14;
    static IndexEntrySize = 0xC;
    static IndexAlignSize = 0x8;
    static ChunkHeaderSize = 0x4;

    segmentsTotalLengthChars = 0;
    index: SnapChunk[];
    header: SnapshotHeader;
    seq: number;
    buffer: Buffer;
    pendingChunk: SnapChunk;
    texts: ops.IPropertyString[];

    constructor(public mergeTree: MergeTree.MergeTree, public filename?: string,
        public onCompletion?: () => void) {
    }

    getCharLengthSegs(alltexts: ops.IPropertyString[], approxCharLength: number, startIndex = 0): ops.MergeTreeChunk {
        //console.log(`start index ${startIndex}`);
        let texts = <ops.IPropertyString[]>[];
        let lengthChars = 0;
        let segCount = 0;
        while ((lengthChars < approxCharLength) && ((startIndex + segCount) < alltexts.length)) {
            let ptext = alltexts[startIndex + segCount];
            segCount++;
            texts.push(ptext);
            if (ptext.text != undefined) {
                lengthChars += ptext.text.length;
            }
        }
        return {
            chunkStartSegmentIndex: startIndex,
            chunkSegmentCount: segCount,
            chunkLengthChars: lengthChars,
            totalLengthChars: this.header.segmentsTotalLength,
            totalSegmentCount: alltexts.length,
            chunkSequenceNumber: this.header.seq,
            segmentTexts: texts
        }
    }

    emit(): API.ITree {
        let chunk1 = this.getCharLengthSegs(this.texts, 10000);
        let chunk2 = this.getCharLengthSegs(this.texts, chunk1.totalLengthChars, chunk1.chunkSegmentCount);

        const tree: API.ITree = {
            entries: [
                {
                    mode: API.FileMode.File,
                    path: "header",
                    type: API.TreeEntry[API.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(chunk1),
                        encoding: "utf-8",
                    },
                },
                {
                    mode: API.FileMode.File,
                    path: "body",
                    type: API.TreeEntry[API.TreeEntry.Blob],
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
        let texts = <ops.IPropertyString[]>[];
        let extractSegment = (segment: MergeTree.Segment, pos: number, refSeq: number, clientId: number,
            start: number, end: number) => {
            if ((segment.seq != MergeTree.UnassignedSequenceNumber) && (segment.seq <= this.seq) &&
                ((segment.removedSeq === undefined) || (segment.removedSeq == MergeTree.UnassignedSequenceNumber) ||
                    (segment.removedSeq > this.seq))) {
                switch (segment.getType()) {
                    case MergeTree.SegmentType.Text:
                        let textSegment = <MergeTree.TextSegment>segment;
                        texts.push({ props: textSegment.properties, text: textSegment.text });
                        break;
                    case MergeTree.SegmentType.Marker:
                        // console.log("got here");
                        let markerSeg = <MergeTree.Marker>segment;
                        texts.push({
                            props: markerSeg.properties,
                            marker: { refType: markerSeg.refType },
                        })
                        break;
                }
            }
            return true;
        }
        this.mergeTree.map({ leaf: extractSegment }, this.seq, MergeTree.NonCollabClient);
        this.texts = texts;
        return texts;
    }

    public static async loadChunk(storage: API.IObjectStorageService, path: string): Promise<ops.MergeTreeChunk> {
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

    // TODO: generalize beyond strings
    emitSegment(segment: MergeTree.Segment, state: MergeTree.IncrementalMapState<Snapshot>) {
        if ((segment.seq != MergeTree.UnassignedSequenceNumber) && (segment.seq <= this.seq) &&
            (segment.getType() == MergeTree.SegmentType.Text)) {
            if ((segment.removedSeq === undefined) ||
                (segment.removedSeq == MergeTree.UnassignedSequenceNumber) ||
                (segment.removedSeq > this.seq)) {
                let textSegment = <MergeTree.TextSegment>segment;
                let chunk = this.index[this.index.length - 1];
                let savedSegmentLength = Snapshot.SegmentLengthSize + Buffer.byteLength(textSegment.text, 'utf8');
                // TODO: get length as UTF8 encoded
                if ((chunk.lengthBytes + savedSegmentLength) > Snapshot.SnapChunkMaxSize) {
                    let newChunk = <SnapChunk>{
                        position: chunk.position + chunk.lengthBytes,
                        lengthBytes: Snapshot.ChunkHeaderSize,
                        lengthChars: 0
                    };
                    this.index.push(newChunk);
                    chunk.buffer = this.buffer;
                    this.pendingChunk = chunk;
                    chunk = newChunk;
                    this.buffer = undefined;
                }
                if (this.buffer === undefined) {
                    this.buffer = new Buffer(Snapshot.SnapChunkMaxSize);
                    this.buffer.fill(0);
                }
                chunk.lengthChars += textSegment.text.length;
                this.segmentsTotalLengthChars += textSegment.text.length;
                //            console.log(`seg ${textSegment.seq} text ${textSegment.text}`);
                chunk.lengthBytes = this.buffer.writeUInt32BE(savedSegmentLength - 4, chunk.lengthBytes);
                chunk.lengthBytes += this.buffer.write(textSegment.text, chunk.lengthBytes);
                if (this.pendingChunk) {
                    state.op = MergeTree.IncrementalExecOp.Yield;
                }
            }
        }
    }
}
