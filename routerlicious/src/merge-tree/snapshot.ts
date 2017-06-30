// tslint:disable

import * as Collections from "./collections";
import * as fs from "fs";
import * as MergeTree from "./mergeTree";
import * as API from "../api";
import { IPropertyString } from "../api";

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

    verify = false;
    segmentsTotalLengthChars = 0;
    index: SnapChunk[];
    header: SnapshotHeader;
    fileDesriptor: number;
    stateStack: Collections.Stack<MergeTree.IncrementalMapState<Snapshot>>;
    seq: number;
    buffer: Buffer;
    pendingChunk: SnapChunk;
    texts: IPropertyString[];

    constructor(public mergeTree: MergeTree.MergeTree, public filename?: string,
        public onCompletion?: () => void) {
    }

    start() {
        fs.open(this.filename, 'w', (err, fd) => {
            // TODO: process err
            this.onOpen(fd);
        });
    }

    getCharLengthSegs(alltexts: API.IPropertyString[], approxCharLength: number, startIndex = 0): API.MergeTreeChunk {
        //console.log(`start index ${startIndex}`);
        let texts = <API.IPropertyString[]>[];
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

    async emit(services: API.ICollaborationServices, id: string) {
        let storage = services.objectStorageService;
        let chunk1 = this.getCharLengthSegs(this.texts, 10000);
        let chunk2 = this.getCharLengthSegs(this.texts, chunk1.totalLengthChars, chunk1.chunkSegmentCount);
        let p1 = storage.write(id + "header", chunk1);
        let p2 = storage.write(id, chunk2);
        return Promise.all([p1, p2]);
    }

    extractSync() {
        let collabWindow = this.mergeTree.getCollabWindow();
        this.seq = collabWindow.minSeq;
        this.header = {
            segmentsTotalLength: this.mergeTree.getLength(this.mergeTree.collabWindow.minSeq,
                MergeTree.NonCollabClient),
            seq: this.mergeTree.collabWindow.minSeq,
        };
        let texts = <API.IPropertyString[]>[];
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
                        console.log("got here");
                        let markerSeg = <MergeTree.Marker>segment;
                        texts.push({
                            props: markerSeg.properties,
                            // TODO: marker end position
                            marker: { behaviors: markerSeg.behaviors, type: markerSeg.type },
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

    static async loadChunk(services: API.ICollaborationServices, id: string): Promise<API.MergeTreeChunk> {
        let chunkAsString: string = await services.objectStorageService.read(id);
        if (chunkAsString.length !== 0) {
            return JSON.parse(chunkAsString) as API.MergeTreeChunk;
        } else {
            return {
                chunkStartSegmentIndex: -1,
                chunkSegmentCount: -1,
                chunkLengthChars: -1,
                totalLengthChars: -1,
                totalSegmentCount: -1,
                chunkSequenceNumber: -1,
                segmentTexts: [],
            }
        }
    }

    static loadSync(filename: string) {
        let segs = <MergeTree.TextSegment[]>[];
        let buf = new Buffer(Snapshot.SnapshotHeaderSize);
        let fd = fs.openSync(filename, 'r');
        let expectedBytes = Snapshot.SnapshotHeaderSize;
        let actualBytes = fs.readSync(fd, buf, 0, expectedBytes, 0);
        if (actualBytes != expectedBytes) {
            console.log(`actual bytes read ${actualBytes} expected ${expectedBytes}`);
        }
        let offset = 0;

        let chunkCount = buf.readUInt32BE(offset);
        // let segmentsTotalLength = buf.readUInt32BE(offset + 4);
        // let indexOffset = buf.readUInt32BE(offset + 8);
        // let segmentsOffset = buf.readUInt32BE(offset + 12);
        // let seq = buf.readUInt32BE(offset + 16);
        let position = actualBytes;

        buf = new Buffer(Snapshot.SnapChunkMaxSize);

        let readChunk = () => {
            actualBytes = fs.readSync(fd, buf, 0, 4, position);
            let lengthBytes = buf.readUInt32BE(0);
            actualBytes = fs.readSync(fd, buf, 4, lengthBytes - 4, position + 4)
            let remainingBytes = actualBytes;
            let offset = 4;
            while (remainingBytes > 0) {
                let prevOffset = offset;
                let segmentLengthBytes = buf.readUInt32BE(offset);
                offset += 4;
                let text = buf.toString('utf8', offset, offset + segmentLengthBytes);
                offset += segmentLengthBytes;
                segs.push(new MergeTree.TextSegment(text, MergeTree.UniversalSequenceNumber,
                    MergeTree.LocalClientId));
                remainingBytes -= (offset - prevOffset);
            }
            position += (actualBytes + 4);
        }

        for (let i = 0; i < chunkCount; i++) {
            readChunk();
        }

        fs.closeSync(fd);
        return segs;
    }

    writtenText: string;

    onOpen(fd: number) {
        let collabWindow = this.mergeTree.getCollabWindow();
        this.fileDesriptor = fd;
        this.seq = collabWindow.minSeq;
        this.index = [{
            position: Snapshot.SnapshotHeaderSize,
            lengthChars: 0,
            lengthBytes: Snapshot.ChunkHeaderSize,
        }];
        this.stateStack = new Collections.Stack<MergeTree.IncrementalMapState<Snapshot>>();
        if (this.verify) {
            this.writtenText = this.mergeTree.getText(this.seq, MergeTree.NonCollabClient);
        }
        let initialState = new MergeTree.IncrementalMapState<Snapshot>(this.mergeTree.root,
            { leaf: (segment, state) => { this.emitSegment(segment, state) } },
            0, this.seq, MergeTree.NonCollabClient, this, 0,
            this.mergeTree.getLength(this.seq, MergeTree.NonCollabClient), 0);
        this.stateStack.push(initialState);
        this.step();
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

    close(verify = false) {
        if (verify) {
            fs.close(this.fileDesriptor, (err) => { this.verifyFile(); });
        }
        else {
            fs.close(this.fileDesriptor, (err) => { this.onCompletion(); });
        }
    }

    verifyReadU32(buf: Buffer, offset: number, u32: number) {
        let ru32 = buf.readUInt32BE(offset);
        if (ru32 != u32) {
            console.log(`uint32 mismatch offset ${offset} ${u32} vs. ${ru32}`);
        }
        return ru32;
    }

    verifyFile() {
        let buf = new Buffer(Snapshot.SnapChunkMaxSize);
        let fd = fs.openSync(this.filename, 'r');
        let expectedBytes = Snapshot.SnapshotHeaderSize;
        let actualBytes = fs.readSync(fd, buf, 0, expectedBytes, 0);
        if (actualBytes != expectedBytes) {
            console.log(`actual bytes read ${actualBytes} expected ${expectedBytes}`);
        }
        this.verifyReadU32(buf, 0, this.header.chunkCount);
        this.verifyReadU32(buf, 4, this.header.segmentsTotalLength);
        this.verifyReadU32(buf, 8, this.header.indexOffset);
        this.verifyReadU32(buf, 12, this.header.segmentsOffset);
        this.verifyReadU32(buf, 16, this.header.seq);
        let savedPositions = <number[]>[];
        let position = actualBytes;

        let mergeTree = new MergeTree.MergeTree("");

        let readChunk = (chunk: SnapChunk) => {
            expectedBytes = chunk.lengthBytes;
            savedPositions.push(position);
            actualBytes = fs.readSync(fd, buf, 0, chunk.lengthBytes, position);
            this.verifyReadU32(buf, 0, chunk.lengthBytes);
            if (actualBytes != expectedBytes) {
                console.log(`actual bytes read ${actualBytes} expected ${expectedBytes}`);
            }
            let remainingBytes = actualBytes - 4;
            let offset = 4;
            while (remainingBytes > 0) {
                let prevOffset = offset;
                let segmentLengthBytes = buf.readUInt32BE(offset);
                offset += 4;
                let text = buf.toString('utf8', offset, offset + segmentLengthBytes);
                offset += segmentLengthBytes;
                mergeTree.appendSegment(text);
                remainingBytes -= (offset - prevOffset);
            }
            position += actualBytes;
        }

        for (let chunk of this.index) {
            readChunk(chunk);
        }

        let readText = mergeTree.getText(MergeTree.UniversalSequenceNumber, MergeTree.NonCollabClient);
        if (readText != this.writtenText) {
            console.log(`text mismatch in file verification seq ${this.seq}`);
            console.log(readText);
            console.log(this.writtenText);
            console.log(mergeTree.toString());
            console.log(this.mergeTree.toString());
        }
        let indexLength = this.header.chunkCount * Snapshot.IndexEntrySize;
        fs.readSync(fd, buf, 0, indexLength, this.header.indexOffset);
        let offset = 0;
        for (let i = 0, len = this.index.length; i < len; i++) {
            let chunk = this.index[i];
            if (savedPositions[i] != chunk.position) {
                console.log(`read logic mismatch chunk pos ${savedPositions[i]} ix ${chunk.position}`)
            }
            this.verifyReadU32(buf, offset, savedPositions[i]);
            this.verifyReadU32(buf, offset + 4, chunk.lengthBytes);
            this.verifyReadU32(buf, offset + 8, chunk.lengthChars);
            offset += Snapshot.IndexEntrySize;
        }
        fs.close(fd, (err) => { this.onCompletion(); });
    }

    writeIndexAndClose(indexPosition: number) {
        let indexSize = Snapshot.IndexEntrySize * this.index.length;
        let indexBuf = new Buffer(indexSize);
        let offset = 0;
        for (let i = 0; i < this.index.length; i++) {
            let chunk = this.index[i];
            offset = indexBuf.writeUInt32BE(chunk.position, offset);
            offset = indexBuf.writeUInt32BE(chunk.lengthBytes, offset);
            offset = indexBuf.writeUInt32BE(chunk.lengthChars, offset);
        }
        if (this.verify) {
            console.log(`index position ${indexPosition.toString(16)} #chunks ${this.index.length}`);
        }
        fs.write(this.fileDesriptor, indexBuf, 0, indexSize, indexPosition,
            (err, written, buf) => {
                // TODO: process err and check written == buffer size
                this.close(this.verify);
            });
    }

    writeHeader() {
        // header information
        let chunkCount = this.index.length;
        let segmentsSize = 0;
        for (let indexEntry of this.index) {
            segmentsSize += indexEntry.lengthBytes;
        }
        let overhang = segmentsSize % Snapshot.IndexAlignSize;
        if (overhang > 0) {
            segmentsSize += (Snapshot.IndexAlignSize - overhang);
        }

        let segmentsOffset = Snapshot.SnapshotHeaderSize;
        let indexOffset = segmentsOffset + segmentsSize;
        // for verification
        this.header = <SnapshotHeader>{
            chunkCount: chunkCount,
            segmentsTotalLength: this.segmentsTotalLengthChars,
            indexOffset: indexOffset,
            segmentsOffset: segmentsOffset,
            seq: this.seq
        };
        // write header
        let headerBuf = new Buffer(Snapshot.SnapshotHeaderSize);
        let offset = 0;
        offset = headerBuf.writeUInt32BE(chunkCount, offset);
        offset = headerBuf.writeUInt32BE(this.segmentsTotalLengthChars, offset);
        offset = headerBuf.writeUInt32BE(indexOffset, offset);
        offset = headerBuf.writeUInt32BE(segmentsOffset, offset);
        offset = headerBuf.writeUInt32BE(this.seq, offset);
        // assert offset == segmentsOffset
        fs.write(this.fileDesriptor, headerBuf, 0, Snapshot.SnapshotHeaderSize, 0,
            (err, written, buf) => {
                // TODO: process err and check written == buffer size
                this.writeIndexAndClose(indexOffset);
            });

    }

    writeLastChunk() {
        let chunk = this.index[this.index.length - 1];
        if (chunk.lengthBytes > 0) {
            this.buffer.writeUInt32BE(chunk.lengthBytes, 0);
            fs.write(this.fileDesriptor, this.buffer, 0, chunk.lengthBytes, chunk.position,
                (err, written, buf) => {
                    // TODO: process err and check written == buffer size
                    this.writeHeader();
                });
        }
    }

    step() {
        this.mergeTree.incrementalBlockMap(this.stateStack);
        if (this.stateStack.empty()) {
            this.writeLastChunk();
        }
        else {
            let state = this.stateStack.top();
            if (state.op == MergeTree.IncrementalExecOp.Yield) {
                state.op = MergeTree.IncrementalExecOp.Go;
                if (this.pendingChunk) {
                    let chunk = this.pendingChunk;
                    let buf = chunk.buffer;
                    buf.writeUInt32BE(chunk.lengthBytes, 0);
                    let pos = chunk.position;
                    this.pendingChunk = undefined;

                    fs.write(this.fileDesriptor, buf, 0, chunk.lengthBytes, pos,
                        (err, written, buf) => {
                            // TODO: process err and check written == buffer size
                            this.step();
                        });
                }
            }
        }
    }

}
