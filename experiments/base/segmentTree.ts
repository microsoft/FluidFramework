/// <reference path="base.d.ts" />
import * as ListUtil from "./list";
import * as random from "random-js";
import * as BST from "./redBlack";

export interface TextSegmentAction {
    <TAccum>(textSegment: TextSegment, pos: number, refSeq: number, clientId: number, start: number, end: number, accum?: TAccum): boolean;
}

export interface TextSegmentBlockAction {
    <TAccum>(textSegmentBlock: TextSegmentBlock, pos: number, refSeq: number, clientId: number, start: number, end: number, accum?: TAccum): boolean;
}

export interface TextSegmentActions {
    leaf: TextSegmentAction;
    pre?: TextSegmentBlockAction;
    post?: TextSegmentBlockAction;
}

export interface SegmentTree {
    map<TAccum>(actions: TextSegmentActions, refSeq: number, clientId: number, accum?: TAccum);
    mapRange<TAccum>(actions: TextSegmentActions, refSeq: number, clientId: number, accum?: TAccum, start?: number, end?: number);
    ensureIntervalBoundary(pos: number, refSeq: number, clientId: number);
    insertInterval(pos: number, refSeq: number, clientId: number, seq: number, textSegment: TextSegment);
    removeRange(start: number, end: number, refSeq: number, seq: number, clientId: number);
    markRangeRemoved(start: number, end: number, refSeq: number, clientId: number, seq: number);
    getContainingSegment(pos: number, refSeq: number, clientId: number): TextSegment;
    createMarker(pos: number, refSeq: number, clientId: number, seq: number): TextMarker;
    getOffset(entry: TextSegment, refSeq: number, clientId: number): number;
    getText(refSeq: number, clientId: number, start?: number, end?: number): string;
    getLength(refSeq: number, clientId: number): number;
    startCollaboration(localClientId);
    getSegmentWindow(): SegmentWindow;
    ackPendingSegment(seq: number);
    updateMinSeq(minSeq: number);
    diag();
}

export interface TextSegmentGroup {
    segments: TextSegment[];
}

// internal (represents multiple leaf segments) if child is defined
export interface TextSegment {
    parent?: TextSegmentBlock;
    child?: TextSegmentBlock;
    // below only for leaves
    text?: string;
    markers?: TextMarker[];
    segmentGroup?: TextSegmentGroup;
    seq?: number;  // if not present assumed to be previous to window min
    clientId?: number;
    removedSeq?: number;
    removedClientId?: number;
}

// list of text segments
export interface TextSegmentBlock {
    liveSegmentCount: number;
    segments: TextSegment[];
    length: number;
    partialLengths?: PartialSequenceLengths;
    parent?: TextSegmentBlock;
}

export interface TextMarker {
    segment: TextSegment;
    offset: number;
}

/**
 * Sequence numbers for collaborative segments start at 1 or greater.  Every segment marked
 * with sequence number zero will be counted as part of the requested string.
 */
export const UniversalSequenceNumber = 0;
export const UnassignedSequenceNumber = -1;
export const TreeMaintainanceSequenceNumber = -2;
export const LocalClientId = -1;

interface PartialSequenceLength {
    seq: number;
    len: number;
    seglen: number;
    clientId?: number;
}

class SegmentWindow {
    clientId = LocalClientId;

    collaborating = false;
    // lowest-numbered segment in window; no client can reference a state before this one
    minSeq = 0;
    // highest-numbered segment in window and current 
    // reference segment for this client
    currentSeq = 0;
}

function leafSegmentTotalLength(textSegment: TextSegment) {
    if (textSegment.removedSeq !== undefined) {
        return 0;
    }
    else {
        return textSegment.text.length;
    }
}

/**
 * Returns the partial length whose sequence number is 
 * the greatest sequence number within a that is
 * less than or equal to key.
 * @param {PartialLength[]} a array of partial segment lengths
 * @param {number} key sequence number
 */
function latestLEQ(a: PartialSequenceLength[], key: number) {
    let best = -1;
    let lo = 0;
    let hi = a.length - 1;
    while (lo <= hi) {
        let mid = lo + Math.floor((hi - lo) / 2);
        if (a[mid].seq <= key) {
            if ((best < 0) || (a[best].seq < a[mid].seq)) {
                best = mid;
            }
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return best;
}

/**
 * Keep track of partial sums of segment lengths for all sequence numbers
 * in the current collaboration window (if any).  Only used during active
 * collaboration.
 */
class PartialSequenceLengths {
    minLength = 0;
    partialLengths: PartialSequenceLength[] = [];
    clientSeqNumbers: PartialSequenceLength[][] = [];

    constructor(public minSeq: number) {
    }

    cliLatestLEQ(clientId: number, refSeq: number) {
        let cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs) {
            return latestLEQ(cliSeqs, refSeq);
        }
        else {
            return -1;
        }
    }

    cliLatest(clientId: number) {
        let cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs && (cliSeqs.length > 0)) {
            return cliSeqs.length - 1;
        }
        else {
            return -1;
        }
    }

    toString() {
        let buf = "";
        for (let partial of this.partialLengths) {
            buf += `(${partial.seq},${partial.len}) `;
        }
        for (let clientId in this.clientSeqNumbers) {
            buf += `C${clientId}[`
            for (let partial of this.clientSeqNumbers[clientId]) {
                buf += `(${partial.seq},${partial.len})`
            }
            buf += ']';
        }
        return `min: ${this.minLength};` + buf;
    }

    recentWindow(segmentWindow: SegmentWindow) {
        let windowSize = segmentWindow.currentSeq - segmentWindow.minSeq;
        return this.partialLengths.length < windowSize;
    }

    getPartialLength(refSeq: number, clientId: number) {
        let pLen = this.minLength;
        let seqIndex = latestLEQ(this.partialLengths, refSeq);
        let cliLatestindex = this.cliLatest(clientId);
        let cliSeq = this.clientSeqNumbers[clientId];
        if (seqIndex >= 0) {
            pLen += this.partialLengths[seqIndex].len;
            if (cliLatestindex >= 0) {
                let cliLatest = cliSeq[cliLatestindex];

                if (cliLatest.seq > refSeq) {
                    pLen += cliLatest.len;
                    let precedingCliIndex = this.cliLatestLEQ(clientId, refSeq);
                    if (precedingCliIndex >= 0) {
                        pLen -= cliSeq[precedingCliIndex].len;
                    }
                }
            }
        }
        else {
            if (cliLatestindex >= 0) {
                let cliLatest = cliSeq[cliLatestindex];
                pLen += cliLatest.len;
            }
        }
        return pLen;
    }

    // clear away partial sums for sequence numbers earlier than the current window
    zamboni(segmentWindow: SegmentWindow) {
        function copyDown(partialLengths: PartialSequenceLength[]) {
            let mindex = latestLEQ(partialLengths, segmentWindow.minSeq);
            let minLength = 0;
            //console.log(`mindex ${mindex}`);
            if (mindex >= 0) {
                minLength = partialLengths[mindex].len;
                let seqCount = partialLengths.length;
                if (mindex <= (seqCount - 1)) {
                    // still some entries remaining
                    let remainingCount = (seqCount - mindex) - 1;
                    //copy down
                    for (let i = 0; i < remainingCount; i++) {
                        partialLengths[i] = partialLengths[i + mindex + 1];
                        partialLengths[i].len -= minLength;
                    }
                    partialLengths.length = remainingCount;
                }
            }
            return minLength;
        }
        this.minLength += copyDown(this.partialLengths);
        for (let clientId in this.clientSeqNumbers) {
            let cliPartials = this.clientSeqNumbers[clientId];
            if (cliPartials) {
                copyDown(cliPartials);
            }
        }
    }

    // assumes sequence number already coalesced
    addClientSeqNumber(partialLength: PartialSequenceLength) {
        if (this.clientSeqNumbers[partialLength.clientId] === undefined) {
            this.clientSeqNumbers[partialLength.clientId] = [];
        }
        let cli = this.clientSeqNumbers[partialLength.clientId];
        let pLen = partialLength.seglen;
        if (cli.length > 0) {
            pLen += cli[cli.length - 1].len;
        }
        cli.push({ seq: partialLength.seq, len: pLen, seglen: partialLength.seglen });
    }

    // assume: seq is latest sequence number; no structural change to sub-tree, but a segment
    // with sequence number seq has been added within the sub-tree
    // TODO: assert client id matches
    update(node: TextSegmentBlock, seq: number, clientId: number, segmentWindow: SegmentWindow) {
        let seqSeglen = 0;
        // compute length for seq across children
        for (let i = 0; i < node.liveSegmentCount; i++) {
            let segment = node.segments[i];
            if (segment.child) {
                let partialLengths = segment.child.partialLengths.partialLengths;
                let seqIndex = latestLEQ(partialLengths, seq);
                if (seqIndex >= 0) {
                    let leqPartial = partialLengths[seqIndex];
                    if (leqPartial.seq == seq) {
                        seqSeglen += leqPartial.seglen;
                    }
                }
            }
            else {
                if (segment.seq == seq) {
                    seqSeglen += segment.text.length;
                }
                else if (segment.removedSeq == seq) {
                    seqSeglen -= segment.text.length;
                }
            }
        }

        function addSeq(partialLengths: PartialSequenceLength[], seq: number, clientId?: number) {
            let seqPartialLen: PartialSequenceLength;
            let penultPartialLen: PartialSequenceLength;
            let leqIndex = latestLEQ(partialLengths, seq);
            if (leqIndex >= 0) {
                let pLen = partialLengths[leqIndex];
                if (pLen.seq == seq) {
                    seqPartialLen = pLen;
                    leqIndex = latestLEQ(partialLengths, seq - 1);
                    if (leqIndex >= 0) {
                        penultPartialLen = partialLengths[leqIndex];
                    }
                }
                else {
                    penultPartialLen = pLen;
                }
            }
            if (seqPartialLen === undefined) {
                seqPartialLen = <PartialSequenceLength>{
                    seq: seq,
                    seglen: seqSeglen,
                    clientId: clientId
                }
                partialLengths.push(seqPartialLen);
            }
            else {
                seqPartialLen.seglen = seqSeglen;
                // assert client id matches
            }
            if (penultPartialLen !== undefined) {
                seqPartialLen.len = seqPartialLen.seglen + penultPartialLen.len;
            }
            else {
                seqPartialLen.len = seqPartialLen.seglen;
            }

        }
        addSeq(this.partialLengths, seq, clientId);
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        addSeq(this.clientSeqNumbers[clientId], seq);
        //    console.log(this.toString());
        this.zamboni(segmentWindow);
        //   console.log('ZZZ');
        //   console.log(this.toString());
    }

    static fromLeaves(combinedPartialLengths: PartialSequenceLengths, textSegmentBlock: TextSegmentBlock, segmentWindow: SegmentWindow) {
        combinedPartialLengths.minLength = 0;

        function insertSegment(segment: TextSegment, removedSeq = false) {
            let seq = segment.seq;
            let segmentLen = segment.text.length;
            let clientId = segment.clientId;
            if (removedSeq) {
                seq = segment.removedSeq;
                segmentLen = -segmentLen;
                clientId = segment.removedClientId;
            }

            let seqPartials = combinedPartialLengths.partialLengths;
            let seqPartialsLen = seqPartials.length;
            // find the first entry with sequence number greater or equal to seq
            let indexFirstGTE = 0;
            for (; indexFirstGTE < seqPartialsLen; indexFirstGTE++) {
                if (seqPartials[indexFirstGTE].seq >= seq) {
                    break;
                }
            }
            if ((indexFirstGTE < seqPartialsLen) && (seqPartials[indexFirstGTE].seq == seq)) {
                seqPartials[indexFirstGTE].seglen += segmentLen;
            }
            else {
                let pLen = <PartialSequenceLength>{ seq: seq, clientId: clientId, len: 0, seglen: segmentLen };
                if (indexFirstGTE < seqPartialsLen) {
                    // shift entries with greater sequence numbers
                    // TODO: investigate performance improvement using BST
                    for (let k = seqPartialsLen; k > indexFirstGTE; k--) {
                        seqPartials[k] = seqPartials[k - 1];
                    }
                    seqPartials[indexFirstGTE] = pLen;
                }
                else {
                    seqPartials.push(pLen);
                }
            }
        }

        function seqLTE(seq: number, minSeq: number) {
            return (seq != UnassignedSequenceNumber) && (seq <= minSeq);
        }

        for (let i = 0; i < textSegmentBlock.liveSegmentCount; i++) {
            let textSegment = textSegmentBlock.segments[i];
            if (textSegment.child === undefined) {
                // leaf segment
                if (seqLTE(textSegment.seq, segmentWindow.minSeq)) {
                    combinedPartialLengths.minLength += textSegment.text.length;
                }
                else {
                    if (textSegment.seq != UnassignedSequenceNumber) {
                        insertSegment(textSegment);
                    }
                }
                if (seqLTE(textSegment.removedSeq, segmentWindow.minSeq)) {
                    combinedPartialLengths.minLength -= textSegment.text.length;
                }
                else {
                    if ((textSegment.removedSeq !== undefined) && (textSegment.removedSeq != UnassignedSequenceNumber)) {
                        insertSegment(textSegment, true);
                    }
                }
            }
        }
        // post-process correctly-ordered partials computing sums and creating
        // lists for each present client id
        let seqPartials = combinedPartialLengths.partialLengths;
        let seqPartialsLen = seqPartials.length;

        let prevLen = 0;
        for (let i = 0; i < seqPartialsLen; i++) {
            seqPartials[i].len = prevLen + seqPartials[i].seglen;
            prevLen = seqPartials[i].len;
            combinedPartialLengths.addClientSeqNumber(seqPartials[i]);
        }
    }

    /**
     * Combine the partial lengths of textSegmentBlock's children
     * @param {TextSegmentBlock} textSegmentBlock an interior node; it is assumed that each interior node child of this block
     * has its partials up to date 
     * @param {SegmentWindow} segmentWindow segment window fo the segment tree containing textSegmentBlock
     */
    static combine(textSegmentBlock: TextSegmentBlock, segmentWindow: SegmentWindow, recur = false) {
        let combinedPartialLengths = new PartialSequenceLengths(segmentWindow.minSeq);
        PartialSequenceLengths.fromLeaves(combinedPartialLengths, textSegmentBlock, segmentWindow);
        let prevPartial: PartialSequenceLength;

        function addNext(partialLength: PartialSequenceLength) {
            let seq = partialLength.seq;
            let pLen = 0;

            if (prevPartial) {
                if (prevPartial.seq == partialLength.seq) {
                    prevPartial.seglen += partialLength.seglen;
                    prevPartial.len += partialLength.seglen;
                    return;
                }
                else {
                    pLen = prevPartial.len;
                    // previous sequence number is finished
                    combinedPartialLengths.addClientSeqNumber(prevPartial);
                }
            }
            prevPartial = {
                seq: seq,
                clientId: partialLength.clientId,
                len: pLen + partialLength.seglen,
                seglen: partialLength.seglen
            };
            combinedPartialLengths.partialLengths.push(prevPartial);
        }

        let childPartials: PartialSequenceLengths[] = [];
        for (let i = 0; i < textSegmentBlock.liveSegmentCount; i++) {
            let textSegment = textSegmentBlock.segments[i];
            if (textSegment.child !== undefined) {
                if (recur) {
                    textSegment.child.partialLengths = PartialSequenceLengths.combine(textSegment.child, segmentWindow, true);
                }
                childPartials.push(textSegment.child.partialLengths);
            }
        }
        let childPartialsLen = childPartials.length;
        if (childPartialsLen != 0) {
            // some children are interior nodes
            if (combinedPartialLengths.partialLengths.length > 0) {
                // some children were leaves; add combined partials from these segments 
                childPartials.push(combinedPartialLengths);
                childPartialsLen++;
                combinedPartialLengths = new PartialSequenceLengths(segmentWindow.minSeq);
            }
            let indices = new Array(childPartialsLen);
            let childPartialsCounts = new Array(childPartialsLen);
            for (let i = 0; i < childPartialsLen; i++) {
                indices[i] = 0;
                childPartialsCounts[i] = childPartials[i].partialLengths.length;
                combinedPartialLengths.minLength += childPartials[i].minLength;
            }
            let outerIndexOfEarliest = 0;
            let earliestPartialLength: PartialSequenceLength;
            while (outerIndexOfEarliest >= 0) {
                outerIndexOfEarliest = -1;
                for (let k = 0; k < childPartialsLen; k++) {
                    // find next earliest sequence number 
                    if (indices[k] < childPartialsCounts[k]) {
                        let cpLen = childPartials[k].partialLengths[indices[k]];
                        if ((outerIndexOfEarliest < 0) || (cpLen.seq < earliestPartialLength.seq)) {
                            outerIndexOfEarliest = k;
                            earliestPartialLength = cpLen;
                        }
                    }
                }
                if (outerIndexOfEarliest >= 0) {
                    addNext(earliestPartialLength);
                    indices[outerIndexOfEarliest]++;
                }
            }
            // add client entry for last partial, if any
            if (prevPartial) {
                combinedPartialLengths.addClientSeqNumber(prevPartial);
            }
        }
        // TODO: incremental zamboni during build
        //console.log(combinedPartialLengths.toString());
        //console.log(`ZZZ...(min ${segmentWindow.minSeq})`);
        combinedPartialLengths.zamboni(segmentWindow);
        //console.log(combinedPartialLengths.toString());
        return combinedPartialLengths;
    }
}

function makeInternalSegment(parent: TextSegmentBlock, child: TextSegmentBlock) {
    child.parent = parent;
    return <TextSegment>{ parent: parent, child: child };
}

function makeLeafSegment(parent: TextSegmentBlock, text: string, sequenceNumber?: number, clientId?: number,
    removedSeq?: number, removedClientId?: number) {
    return <TextSegment>{
        parent: parent,
        text: text,
        seq: sequenceNumber,
        clientId: clientId,
        removedSeq: removedSeq,
        removedClientId: removedClientId
    };
}

function addToSegmentGroup(segment: TextSegment) {
    segment.segmentGroup.segments.push(segment);
}

function segmentGroupReplace(currentSeg: TextSegment, newSegment: TextSegment) {
    let segmentGroup = currentSeg.segmentGroup;
    for (let i = 0, len = segmentGroup.segments.length; i < len; i++) {
        if (segmentGroup.segments[i] == currentSeg) {
            segmentGroup.segments[i] = newSegment;
            break;
        }
    }
    currentSeg.segmentGroup = undefined;
}

function makeLeafSegmentFromSplit(parent: TextSegmentBlock, text: string, origSegment: TextSegment) {
    let leafSegment = <TextSegment>{
        parent: parent,
        text: text,
        seq: origSegment.seq,
        clientId: origSegment.clientId,
        removedSeq: origSegment.removedSeq,
        removedClientId: origSegment.removedClientId,
        segmentGroup: origSegment.segmentGroup,
    };
    if (leafSegment.segmentGroup) {
        addToSegmentGroup(leafSegment);
    }
    return leafSegment;
}
// add pos so can split markers
function copyLeafSegment(textSegment: TextSegment) {
    function migrateMarkers(segment: TextSegment, markers?: TextMarker[]) {
        if (markers) {
            return markers;
        }
    }
    let newSegment = <TextSegment>{
        parent: textSegment.parent,
        text: textSegment.text,
        markers: textSegment.markers,
        removedClientId: textSegment.removedClientId,
        removedSeq: textSegment.removedSeq,
        seq: textSegment.seq,
        clientId: textSegment.clientId,
        segmentGroup: textSegment.segmentGroup
    };
    if (newSegment.segmentGroup) {
        segmentGroupReplace(textSegment, newSegment);
    }
    if (newSegment.markers) {
        for (let i = 0, len = newSegment.markers.length; i < len; i++) {
            newSegment.markers[i].segment = newSegment;
        }
    }
    return newSegment;
}

function clock() {
    return process.hrtime();
}

function elapsedMicroseconds(start: number[]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
    return duration;
}

const enum MsgType {
    INSERT,
    REMOVE
}

interface DeltaMsg {
    type: MsgType;
    seq: number;
    refSeq: number;
    clientId: number;
    pos1: number;
    pos2?: number;
    text?: string;
    minseq?: number;  // sent by server; minumum ref seq across clients
}

function makeInsertMsg(text: string, pos: number, seq: number, refSeq: number, clientId: number) {
    return <DeltaMsg>{ type: MsgType.INSERT, text: text, pos1: pos, seq: seq, refSeq: refSeq, clientId: clientId };
}

function makeRemoveMsg(start: number, end: number, seq: number, refSeq: number, clientId: number) {
    return <DeltaMsg>{ type: MsgType.REMOVE, pos1: start, pos2: end, seq: seq, refSeq: refSeq, clientId: clientId };
}

export function TestPack() {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    let minSegCount = 1;
    let maxSegCount = 1000;
    let segmentCountDistribution = random.integer(minSegCount, maxSegCount);
    let smallSegmentCountDistribution = random.integer(1, 2);
    function randSmallSegmentCount() {
        return smallSegmentCountDistribution(mt);
    }
    function randSegmentCount() {
        return segmentCountDistribution(mt);
    }
    let textLengthDistribution = random.integer(1, 5);
    function randTextLength() {
        return textLengthDistribution(mt);
    }
    const zedCode = 48;
    function randomString(len: number, c: string) {
        let str = "";
        for (let i = 0; i < len; i++) {
            str += c;
        }
        return str;
    }

    function clientServer() {
        const clientCount = 4;
        let server = new TestServer("don't ask for whom the bell tolls; it tolls for thee");
        let clients = <TestClient[]>Array(clientCount);
        for (let i = 0; i < clientCount; i++) {
            clients[i] = new TestClient("don't ask for whom the bell tolls; it tolls for thee");
            clients[i].startCollaboration(i);
        }
        server.startCollaboration(clientCount);
        server.addClients(clients);

        function checkTextMatch() {
            let serverText = server.getText();
            for (let client of clients) {
                let cliText = client.getText();
                if (cliText != serverText) {
                    console.log(`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    console.log(serverText);
                    console.log(cliText);
                    console.log(server.segTree.toString());
                    console.log(client.segTree.toString());
                    return true;
                }
            }
            return false;
        }

        let rounds = 10000;
        function clientProcessSome(client: TestClient, all = false) {
            let cliMsgCount = client.q.count();
            let countToApply: number;
            if (all) {
                countToApply = cliMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * cliMsgCount / 3), cliMsgCount)(mt);
            }
            client.applyMessages(countToApply);
        }

        function serverProcessSome(server: TestClient, all = false) {
            let svrMsgCount = server.q.count();
            let countToApply: number;
            if (all) {
                countToApply = svrMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * svrMsgCount / 3), svrMsgCount)(mt);
            }
            server.applyMessages(countToApply);
        }

        for (let i = 0; i < rounds; i++) {
            for (let client of clients) {
                let insertSegmentCount = randSmallSegmentCount();
                for (let j = 0; j < insertSegmentCount; j++) {
                    let textLen = randTextLength();
                    let text = randomString(textLen, String.fromCharCode(zedCode + ((client.getCurrentSeq() + j) % 50)));
                    let preLen = client.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    server.enqueueMsg(makeInsertMsg(text, pos, UnassignedSequenceNumber, client.getCurrentSeq(), client.getClientId()));
                    client.insertSegmentLocal(text, pos);
                }
                serverProcessSome(server);
                clientProcessSome(client);

                let removeSegmentCount = Math.floor(3 * insertSegmentCount / 4);
                if (removeSegmentCount < 1) {
                    removeSegmentCount = 1;
                }
                for (let j = 0; j < removeSegmentCount; j++) {
                    let dlen = randTextLength();
                    let preLen = client.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    server.enqueueMsg(makeRemoveMsg(pos, pos + dlen, UnassignedSequenceNumber, client.getCurrentSeq(), client.getClientId()));
                    client.removeSegmentLocal(pos, pos + dlen);
                }
                serverProcessSome(server);
                clientProcessSome(client);
            }
            // process remaining messages
            serverProcessSome(server, true);
            for (let client of clients) {
                clientProcessSome(client, true);
            }
            if (checkTextMatch()) {
                console.log(`round: ${i}`);
                break;
            }
            if (0 == (i % 100)) {
                console.log(`round: ${i}`);
            }
        }
    }

    function randolicious() {
        let insertRounds = 40;
        let removeRounds = 32;

        let cliA = new TestClient("a stitch in time saves nine");
        cliA.startCollaboration(0);
        let cliB = new TestClient("a stitch in time saves nine");
        cliB.startCollaboration(1);
        function checkTextMatch(checkSeq: number) {
            let error = false;
            if (cliA.getCurrentSeq() != checkSeq) {
                console.log(`client A has seq number ${cliA.getCurrentSeq()} mismatch with ${checkSeq}`);
                error = true;
            }
            if (cliB.getCurrentSeq() != checkSeq) {
                console.log(`client B has seq number ${cliB.getCurrentSeq()} mismatch with ${checkSeq}`);
                error = true;
            }
            let aText = cliA.getText();
            let bText = cliB.getText();
            if (aText != bText) {
                console.log(`mismatch @${checkSeq}:`)
                console.log(aText);
                console.log(bText);
                error = true;
            }
            return error;
        }
        cliA.accumTime = 0;
        cliB.accumTime = 0;
        function insertTest() {
            for (let i = 0; i < insertRounds; i++) {
                let insertCount = randSegmentCount();
                let sequenceNumber = cliA.getCurrentSeq() + 1;
                let firstSeq = sequenceNumber;
                for (let j = 0; j < insertCount; j++) {
                    let textLen = randTextLength();
                    let text = randomString(textLen, String.fromCharCode(zedCode + (sequenceNumber % 50)));
                    let preLen = cliA.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    cliB.insertSegmentRemote(text, pos, sequenceNumber++, cliA.getCurrentSeq(), cliA.segTree.getSegmentWindow().clientId);
                    cliA.insertSegmentLocal(text, pos);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliA.ackPendingSegment(k);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }
                cliA.updateMinSeq(sequenceNumber - 1);
                cliB.updateMinSeq(sequenceNumber - 1);
                insertCount = randSegmentCount();
                sequenceNumber = cliA.getCurrentSeq() + 1;
                firstSeq = sequenceNumber;
                for (let j = 0; j < insertCount; j++) {
                    let textLen = randTextLength();
                    let text = randomString(textLen, String.fromCharCode(zedCode + (sequenceNumber % 50)));
                    let preLen = cliB.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    cliA.insertSegmentRemote(text, pos, sequenceNumber++, cliB.getCurrentSeq(), cliB.segTree.getSegmentWindow().clientId);
                    cliB.insertSegmentLocal(text, pos);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliB.ackPendingSegment(k);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }
                cliA.updateMinSeq(sequenceNumber - 1);
                cliB.updateMinSeq(sequenceNumber - 1);
            }
            return false;
        }


        function removeTest() {
            for (let i = 0; i < removeRounds; i++) {
                let removeCount = randSegmentCount();
                let sequenceNumber = cliA.getCurrentSeq() + 1;
                let firstSeq = sequenceNumber;
                for (let j = 0; j < removeCount; j++) {
                    let dlen = randTextLength();
                    let preLen = cliA.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    cliB.removeSegmentRemote(pos, pos + dlen, sequenceNumber++, cliA.getCurrentSeq(), cliA.segTree.getSegmentWindow().clientId);
                    cliA.removeSegmentLocal(pos, pos + dlen);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliA.ackPendingSegment(k);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }
                cliA.updateMinSeq(sequenceNumber - 1);
                cliB.updateMinSeq(sequenceNumber - 1);
                removeCount = randSegmentCount();
                sequenceNumber = cliA.getCurrentSeq() + 1;
                firstSeq = sequenceNumber;
                for (let j = 0; j < removeCount; j++) {
                    let dlen = randTextLength();
                    let preLen = cliB.getLength();
                    let pos = random.integer(0, preLen)(mt);
                    cliA.removeSegmentRemote(pos, pos + dlen, sequenceNumber++, cliB.getCurrentSeq(), cliB.segTree.getSegmentWindow().clientId);
                    cliB.removeSegmentLocal(pos, pos + dlen);
                }
                for (let k = firstSeq; k < sequenceNumber; k++) {
                    cliB.ackPendingSegment(k);
                }
                if (checkTextMatch(sequenceNumber - 1)) {
                    return true;
                }
                cliA.updateMinSeq(sequenceNumber - 1);
                cliB.updateMinSeq(sequenceNumber - 1);
            }
            return false;
        }
        if (insertTest()) {
            console.log(cliA.segTree.toString());
            console.log(cliB.segTree.toString());
        }
        else {
            console.log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.segTree.getSegmentWindow().minSeq}`);
            //            console.log(cliA.segTree.toString());

            console.log(`testing remove at ${cliA.getCurrentSeq()} and ${cliB.getCurrentSeq()}`);
            if (removeTest()) {
                console.log(cliA.segTree.toString());
                console.log(cliB.segTree.toString());
            }
        }
        console.log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.segTree.getSegmentWindow().minSeq}`);
        //                console.log(cliA.segTree.toString());
        //console.log(cliB.segTree.toString());
        console.log(cliA.getText());
        let aveWindow = ((minSegCount + maxSegCount) / 2).toFixed(1);
        let aveTime = (cliA.accumTime / cliA.accumOps).toFixed(3);
        let aveWindowTime = (cliA.accumWindowTime / cliA.accumOps).toFixed(3);
        console.log(`accum time ${cliA.accumTime} us ops: ${cliA.accumOps} ave window ${aveWindow} ave time ${aveTime}`)
        console.log(`accum window time ${cliA.accumWindowTime} us ave window time ${aveWindowTime}; max ${cliA.maxWindowTime}`)
        //console.log(cliB.getText());
    }

    function firstTest() {
        let cli = new TestClient("on the mat.");
        cli.startCollaboration(1);
        cli.insertSegmentRemote("that ", 0, 1, 0, 0);
        cli.insertSegmentRemote("fat ", 0, 2, 0, 2);
        cli.insertSegmentLocal("cat ", 5);
        console.log(cli.segTree.toString());
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                console.log(cli.relText(i, j));
            }
        }
        cli.segTree.ackPendingSegment(3);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 4; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.insertSegmentRemote("very ", 5, 4, 2, 2);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 5; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli = new TestClient(" old sock!");
        cli.startCollaboration(1);
        cli.insertSegmentRemote("abcde", 0, 1, 0, 2);
        cli.insertSegmentRemote("yyy", 0, 2, 0, 0);
        cli.insertSegmentRemote("zzz", 2, 3, 1, 3);
        cli.insertSegmentRemote("EAGLE", 1, 4, 1, 4);
        cli.insertSegmentRemote("HAS", 4, 5, 1, 5);
        cli.insertSegmentLocal(" LANDED", 19);
        cli.insertSegmentRemote("yowza: ", 0, 6, 4, 2);
        cli.segTree.ackPendingSegment(7);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 6; clientId++) {
            for (let refSeq = 0; refSeq < 8; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.removeSegmentRemote(3, 5, 8, 6, 0);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 6; clientId++) {
            for (let refSeq = 0; refSeq < 9; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli = new TestClient("abcdefgh");
        cli.startCollaboration(1);
        cli.removeSegmentRemote(1, 3, 1, 0, 3);
        console.log(cli.segTree.toString());
        cli.insertSegmentRemote("zzz", 2, 2, 0, 2);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 3; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.insertSegmentRemote(" chaser", 9, 3, 2, 3);
        cli.removeSegmentLocal(12, 14);
        cli.segTree.ackPendingSegment(4);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 5; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        cli.insertSegmentLocal("*yolumba*", 14);
        cli.insertSegmentLocal("-zanzibar-", 17);
        cli.segTree.ackPendingSegment(5);
        cli.insertSegmentRemote("(aaa)", 2, 6, 4, 2);
        cli.segTree.ackPendingSegment(7);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 8; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        /*
        cli.removeSegmentLocal(3,8);
        cli.removeSegmentLocal(5,7);
        cli.ackPendingSegment(8);
        cli.ackPendingSegment(9);
        */
        cli.removeSegmentRemote(3, 8, 8, 7, 2);
        cli.removeSegmentRemote(5, 7, 9, 7, 2);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 4; clientId++) {
            for (let refSeq = 0; refSeq < 10; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
    }
    return {
        firstTest: firstTest,
        randolicious: randolicious,
        clientServer: clientServer
    }
}

export class TestClient {
    segTree: SegmentTree;
    accumTime = 0;
    accumWindowTime = 0;
    maxWindowTime = 0;
    accumWindow = 0;
    accumOps = 0;
    verboseOps = false;
    q: ListUtil.List<DeltaMsg>;

    constructor(initText: string) {
        this.segTree = segmentTree(initText);
        this.q = ListUtil.ListMakeHead<DeltaMsg>();
    }

    enqueueMsg(msg: DeltaMsg) {
        this.q.enqueue(msg);
    }

    coreApplyMsg(msg: DeltaMsg) {
        switch (msg.type) {
            case MsgType.INSERT:
                this.insertSegmentRemote(msg.text, msg.pos1, msg.seq, msg.refSeq, msg.clientId);
                break;
            case MsgType.REMOVE:
                this.removeSegmentRemote(msg.pos1, msg.pos2, msg.seq, msg.refSeq, msg.clientId);
                break;
        }
    }

    applyMsg(msg: DeltaMsg) {
        if ((msg.minseq !== undefined) && (msg.minseq > this.segTree.getSegmentWindow().minSeq)) {
            this.updateMinSeq(msg.minseq);
        }
        if (msg.clientId == this.getClientId()) {
            this.ackPendingSegment(msg.seq);
        }
        else {
            this.coreApplyMsg(msg);
        }
    }

    applyMessages(msgCount: number) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                this.applyMsg(msg);
            }
            else {
                break;
            }
            msgCount--;
        }
    }

    removeSegmentLocal(start: number, end: number) {
        let segWindow = this.segTree.getSegmentWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = UnassignedSequenceNumber;
        let clockStart = clock();
        this.segTree.markRangeRemoved(start, end, refSeq, clientId, seq);
        this.accumTime += elapsedMicroseconds(clockStart);
        this.accumOps++;
        if (this.verboseOps) {
            console.log(`remove local cli ${clientId} ref seq ${refSeq}`);
        }
    }

    removeSegmentRemote(start: number, end: number, seq: number, refSeq: number, clientId: number) {
        let clockStart = clock();
        this.segTree.markRangeRemoved(start, end, refSeq, clientId, seq);
        this.segTree.getSegmentWindow().currentSeq = seq;
        this.accumTime += elapsedMicroseconds(clockStart);
        this.accumOps++;
        if (this.verboseOps) {
            console.log(`@cli ${this.segTree.getSegmentWindow().clientId} seq ${seq} remove remote start ${start} end ${end} refseq ${refSeq} cli ${clientId}`);
        }
    }

    insertSegmentLocal(text: string, pos: number) {
        let segWindow = this.segTree.getSegmentWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = UnassignedSequenceNumber;
        let textSegment = <TextSegment>{
            text: text,
            seq: seq,
            clientId: clientId
        };
        let clockStart = clock();
        this.segTree.insertInterval(pos, refSeq, clientId, seq, textSegment);
        this.accumTime += elapsedMicroseconds(clockStart);
        this.accumOps++;
        if (this.verboseOps) {
            console.log(`insert local text ${text} pos ${pos} cli ${clientId} ref seq ${refSeq}`);
        }
    }

    insertSegmentRemote(text: string, pos: number, seq: number, refSeq: number, clientId: number) {
        let segWindow = this.segTree.getSegmentWindow();
        let textSegment = <TextSegment>{
            text: text,
            seq: seq,
            clientId: clientId
        };
        let clockStart = clock();
        this.segTree.insertInterval(pos, refSeq, clientId, seq, textSegment);
        this.segTree.getSegmentWindow().currentSeq = seq;

        this.accumTime += elapsedMicroseconds(clockStart);
        this.accumOps++;
        if (this.verboseOps) {
            console.log(`@cli ${this.segTree.getSegmentWindow().clientId} text ${text} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${clientId}`);
        }
    }

    ackPendingSegment(seq: number) {
        this.segTree.ackPendingSegment(seq);
        this.segTree.getSegmentWindow().currentSeq = seq;
        if (this.verboseOps) {
            console.log(`@cli ${this.segTree.getSegmentWindow().clientId} ack seq # ${seq}`);
        }
    }

    updateMinSeq(minSeq: number) {
        let clockStart = clock();
        this.segTree.updateMinSeq(minSeq);
        let elapsed = elapsedMicroseconds(clockStart);
        if (elapsed > this.maxWindowTime) {
            this.maxWindowTime = elapsed;
        }
        this.accumWindowTime += elapsed;
    }

    getCurrentSeq() {
        return this.segTree.getSegmentWindow().currentSeq;
    }

    getClientId() {
        return this.segTree.getSegmentWindow().clientId;
    }

    getText() {
        let segmentWindow = this.segTree.getSegmentWindow();
        return this.segTree.getText(segmentWindow.currentSeq, segmentWindow.clientId);
    }

    getLength() {
        let segmentWindow = this.segTree.getSegmentWindow();
        return this.segTree.getLength(segmentWindow.currentSeq, segmentWindow.clientId);
    }

    relText(clientId: number, refSeq: number) {
        return `cli: ${clientId} refSeq: ${refSeq}: ` + this.segTree.getText(refSeq, clientId);
    }

    startCollaboration(localClientId: number) {
        this.segTree.startCollaboration(localClientId);
    }
}

interface ClientSeq {
    refSeq: number;
    clientId: number;
}

var clientSeqComparer: BST.Comparer<ClientSeq> = {
    min: { refSeq: -1, clientId: -1 },
    compare: (a, b) => a.refSeq - b.refSeq
}

export class TestServer extends TestClient {
    seq = 1;
    clients: TestClient[];
    clientSeqNumbers: BST.Heap<ClientSeq>;

    constructor(initText: string) {
        super(initText);
    }

    addClients(clients: TestClient[]) {
        this.clientSeqNumbers = new BST.Heap<ClientSeq>([], clientSeqComparer);
        this.clients = clients;
        for (let client of clients) {
            this.clientSeqNumbers.add({ refSeq: client.getCurrentSeq(), clientId: client.getClientId() });
        }
    }

    applyMsg(msg: DeltaMsg) {
        this.coreApplyMsg(msg);
    }

    applyMessages(msgCount: number) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                msg.seq = this.seq++;
                this.applyMsg(msg);
                if (this.clients) {
                    let minCli = this.clientSeqNumbers.peek();
                    if (minCli && (minCli.clientId == msg.clientId) && (minCli.refSeq < msg.refSeq)) {
                        let cliSeq = this.clientSeqNumbers.get();
                        let oldSeq = cliSeq.refSeq;
                        cliSeq.refSeq = msg.refSeq;
                        this.clientSeqNumbers.add(cliSeq);
                        minCli = this.clientSeqNumbers.peek();
                        if (minCli.refSeq > oldSeq) {
                            msg.minseq = minCli.refSeq;
                            this.updateMinSeq(minCli.refSeq);
                        }
                    }
                    for (let client of this.clients) {
                        client.enqueueMsg(msg);
                    }
                }
            }
            else {
                break;
            }
            msgCount--;
        }
    }
}

// represents a sequence of text segments
export function segmentTree(text: string): SegmentTree {
    // should be a power of 2
    const MaxSegments = 8;
    function makeNode(liveSegmentCount: number) {
        // assert childCount <= MaxEntries
        return <TextSegmentBlock>{ liveSegmentCount: liveSegmentCount, segments: <TextSegment[]>new Array(MaxSegments) };
    }

    let root = initialNode(text);
    let segmentWindow = new SegmentWindow();
    let pendingSegments: ListUtil.List<TextSegmentGroup>;

    // for now assume min starts at zero
    function startCollaboration(localClientId: number) {
        segmentWindow.clientId = localClientId;
        segmentWindow.minSeq = 0;
        segmentWindow.collaborating = true;
        segmentWindow.currentSeq = 0;
        pendingSegments = ListUtil.ListMakeHead<TextSegmentGroup>();
    }

    function getSegmentWindow() {
        return segmentWindow;
    }

    function getLength(refSeq: number, clientId: number) {
        return nodeLength(root, refSeq, clientId);
    }

    function getOffset(leafSegment: TextSegment, refSeq: number, clientId: number) {
        if (leafSegment.text) {
            let totalOffset = 0;
            let parent = leafSegment.parent;
            let prevParent: TextSegmentBlock;
            while (parent) {
                let segments = parent.segments;
                for (let segmentIndex = 0; segmentIndex < parent.liveSegmentCount; segmentIndex++) {
                    let segment = segments[segmentIndex];
                    if ((prevParent && (segment.child == prevParent)) || (segment == leafSegment)) {
                        break;
                    }
                    totalOffset += segmentLength(segment, refSeq, clientId);
                }
                prevParent = parent;
                parent = parent.parent;
            }
            return totalOffset;
        }
    }

    function initialNode(text: string) {
        let node = makeNode(1);
        node.segments[0] = makeLeafSegment(node, text, UniversalSequenceNumber, LocalClientId);
        node.length = text.length;
        return node;
    }

    // TODO: handle start and end positions
    function gatherText(textSegment: TextSegment, pos: number, refSeq: number, clientId: number, start: number, end: number, accumText: TextSegment) {
        if ((textSegment.removedSeq === undefined) || (textSegment.removedSeq == UnassignedSequenceNumber) || (textSegment.removedSeq > refSeq)) {
            accumText.text += textSegment.text;
        }
        return true;
    }

    function getText(refSeq: number, clientId: number, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = nodeLength(root, refSeq, clientId);
        }
        let accum = <TextSegment>{ text: "" };
        mapRange({ leaf: gatherText }, refSeq, clientId, accum, start, end);
        return accum.text;
    }

    function getContainingSegment(pos: number, refSeq: number, clientId: number) {
        if (pos !== undefined) {
            return search(root, refSeq, clientId, pos);
        }
        // TODO: error on undefined
    }

    // TODO: change to assign to passed in marker
    function createMarker(pos: number, refSeq: number, clientId: number, seq: number) {
        let marker = <TextMarker>{ segment: undefined, offset: undefined };
        function updateMarker(segment: TextSegment, pos: number, start: number) {
            marker.offset = start;
            marker.segment = segment;
            return true;
        }
        search(root, pos, refSeq, clientId, updateMarker, marker);
        return marker;
    }

    function nodeLength(node: TextSegmentBlock, refSeq: number, clientId: number) {
        if ((segmentWindow.collaborating) && (clientId != segmentWindow.clientId)) {
            return node.partialLengths.getPartialLength(refSeq, clientId);
        }
        else {
            return node.length;
        }
    }

    function segmentLength(segment: TextSegment, refSeq: number, clientId: number) {
        if ((!segmentWindow.collaborating) || (segmentWindow.clientId == clientId)) {
            // local client sees all segments, even when collaborating
            if (segment.child) {
                return segment.child.length;
            }
            else {
                return leafSegmentTotalLength(segment);
            }
        }
        else {
            // sequence number within window 
            if (segment.child) {
                return segment.child.partialLengths.getPartialLength(refSeq, clientId);
            }
            else {
                if ((segment.clientId == clientId) || ((segment.seq != UnassignedSequenceNumber) && (segment.seq <= refSeq))) {
                    // segment happened by reference sequence number or segment from requesting client
                    if ((segment.removedSeq !== undefined) &&
                        ((segment.removedClientId == clientId) ||
                            ((segment.removedSeq != UnassignedSequenceNumber) && (segment.removedSeq <= refSeq)))) {
                        return 0;
                    }
                    else {
                        return segment.text.length;
                    }
                }
                else {
                    // segment invisible to client at reference sequence number
                    return 0;
                }
            }
        }
    }

    let lastClear = 0;

    function updateMinSeq(minSeq: number) {
        segmentWindow.minSeq = minSeq;
    }

    function search<TAccum>(node: TextSegmentBlock, pos: number, refSeq: number, clientId: number, action?: TextSegmentAction, accum?: TAccum): TextSegment {
        let segments = node.segments;
        let start = pos;
        for (let segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            let segment = segments[segmentIndex];
            let len = segmentLength(segment, refSeq, clientId);
            if (start < len) {
                // found entry containing pos
                if (segment.child) {
                    // internal node
                    return search(segment.child, pos, refSeq, clientId, action);
                }
                else {
                    if (action) {
                        action(segment, pos, refSeq, clientId, start, -1, accum);
                    }
                    return segment;
                }
            }
            else {
                start -= len;
            }
        }
    }

    function updateRoot(splitNode: TextSegmentBlock, refSeq: number, clientId: number) {
        if (splitNode !== undefined) {
            let newRoot = makeNode(2);
            newRoot.segments[0] = makeInternalSegment(newRoot, root);
            newRoot.segments[1] = makeInternalSegment(newRoot, splitNode);
            root = newRoot;
        }
        nodeUpdateLengthNewStructure(root);
    }

    /**
     * Assign sequence number to existing segment; update partial lengths to reflect the change
     * @param seq sequence number given by server to pending segment
     */
    function ackPendingSegment(seq: number) {
        let pendingSegmentGroup = pendingSegments.dequeue();
        let nodesToUpdate = <TextSegmentBlock[]>[];
        let clientId: number;
        if (pendingSegmentGroup !== undefined) {
            pendingSegmentGroup.segments.map((pendingSegment) => {
                if (pendingSegment.seq == UnassignedSequenceNumber) {
                    pendingSegment.seq = seq;
                }
                else {
                    pendingSegment.removedSeq = seq;
                }
                //console.log(`set pending segment with text ${pendingSegment.text} to sequence number ${seq}`);
                clientId = segmentWindow.clientId;
                if (nodesToUpdate.indexOf(pendingSegment.parent) < 0) {
                    nodesToUpdate.push(pendingSegment.parent);
                }
            });
            for (let node of nodesToUpdate) {
                nodeUpdatePathLengths(node, seq, clientId);
            }
        }
    }

    function addToPendingList(segment: TextSegment, segmentGroup?: TextSegmentGroup) {
        if (segmentGroup === undefined) {
            segmentGroup = <TextSegmentGroup>{ segments: [] };
            pendingSegments.enqueue(segmentGroup);
        }
        // TODO: share this group with UNDO
        segment.segmentGroup = segmentGroup;
        addToSegmentGroup(segment);
        return segmentGroup;
    }

    // TODO: just pass text in to this function; no need to make text segment because will not be placed
    function insertInterval(pos: number, refSeq: number, clientId: number, seq: number, textSegment: TextSegment) {
        textSegment.seq = seq;
        textSegment.clientId = clientId;
        ensureIntervalBoundary(pos, refSeq, clientId);
        let splitNode = nodeInsertBefore(root, pos, refSeq, clientId, textSegment);
        updateRoot(splitNode, refSeq, clientId);
    }

    function nodeInsertBefore(node: TextSegmentBlock, pos: number, refSeq: number, clientId: number, textSegment: TextSegment) {
        return insertingWalk(node, pos, refSeq, clientId, textSegment.seq, (segment: TextSegment, pos: number) => {
            function saveIfLocal(locSegment: TextSegment) {
                // save segment so can assign sequence number when acked by server
                if (segmentWindow.collaborating && (locSegment.seq == UnassignedSequenceNumber) && (clientId == segmentWindow.clientId)) {
                    addToPendingList(locSegment)
                    //console.log(`saved local seg with text: ${locSegment.text}`);
                }
            }
            if (!segment) {
                segment = <TextSegment>{
                    parent: node,
                    text: textSegment.text,
                    seq: textSegment.seq,
                    clientId: textSegment.clientId
                };
                saveIfLocal(segment);
                return segment;
            }
            else {
                let newSegment = copyLeafSegment(segment);
                segment.text = textSegment.text;
                segment.seq = textSegment.seq;
                segment.clientId = textSegment.clientId;
                segment.removedClientId = undefined;
                segment.removedSeq = undefined;
                segment.segmentGroup = undefined;
                saveIfLocal(segment);
                return newSegment;
            }
        });
    }

    function splitLeafSegment(segment: TextSegment, pos: number) {
        if (pos > 0) {
            let remainingText = segment.text.substring(pos);
            segment.text = segment.text.substring(0, pos);
            let leafSegment = makeLeafSegmentFromSplit(segment.parent, remainingText, segment);
            return leafSegment;
        }
    }

    function ensureIntervalBoundary(pos: number, refSeq: number, clientId: number) {
        let splitNode = insertingWalk(root, pos, refSeq, clientId, TreeMaintainanceSequenceNumber, splitLeafSegment);
        updateRoot(splitNode, refSeq, clientId);
    }

    function tieAtLaterSegment(pos: number, len: number, segment: TextSegment) {
        return (pos == 0) && (len == 0) && (!segment.child) && (segment.seq == UnassignedSequenceNumber) && (segment.clientId == segmentWindow.clientId);
    }

    function insertingWalk(node: TextSegmentBlock, pos: number, refSeq: number, clientId: number, seq: number,
        leafAction: (segment: TextSegment, pos: number) => TextSegment) {
        let segments = node.segments;
        let segmentIndex: number;
        let segment: TextSegment;
        let newSegment: TextSegment;
        let found = false;
        for (segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            segment = segments[segmentIndex];
            let len = segmentLength(segment, refSeq, clientId);
            if ((pos < len) || (segmentWindow.collaborating && tieAtLaterSegment(pos, len, segment))) {
                // found entry containing pos
                found = true;
                if (segment.child) {
                    //internal node
                    let splitNode = insertingWalk(segment.child, pos, refSeq, clientId, seq, leafAction);
                    if (splitNode === undefined) {
                        nodeUpdateLength(node, seq, clientId);
                        return undefined;
                    }
                    newSegment = makeInternalSegment(node, splitNode);
                    segmentIndex++; // insert after
                }
                else {
                    newSegment = leafAction(segment, pos);
                    if (newSegment) {
                        segmentIndex++; // insert after
                    }
                    else {
                        // no change
                        return undefined;
                    }
                }
                break;
            }
            else {
                pos -= len;
            }
        }
        if (traceTraversal) {
            if ((!found) && (pos > 0)) {
                console.log(`inserting walk fell through pos ${pos} len: ${nodeLength(root, refSeq, clientId)}`);
            }
        }
        if (!newSegment) {
            if (pos == 0) {
                newSegment = leafAction(undefined, pos);
            }
        }
        if (newSegment) {
            for (let i = node.liveSegmentCount; i > segmentIndex; i--) {
                node.segments[i] = node.segments[i - 1];
            }
            node.segments[segmentIndex] = newSegment;
            newSegment.parent = node;
            node.liveSegmentCount++;
            if (node.liveSegmentCount < MaxSegments) {
                nodeUpdateLength(node, seq, clientId);
                return undefined;
            }
            else {
                return split(node);
            }
        }
        else {
            return undefined;
        }
    }

    function split(node: TextSegmentBlock) {
        let halfCount = MaxSegments / 2;
        let newNode = makeNode(halfCount);
        node.liveSegmentCount = halfCount;
        for (let i = 0; i < halfCount; i++) {
            newNode.segments[i] = node.segments[(halfCount) + i];
            newNode.segments[i].parent = newNode;
            if (newNode.segments[i].child) {
                newNode.segments[i].child.parent = newNode;
            }
        }
        nodeUpdateLengthNewStructure(node);
        nodeUpdateLengthNewStructure(newNode);
        return newNode;
    }

    function markRangeRemoved(start: number, end: number, refSeq: number, clientId: number, seq: number) {
        ensureIntervalBoundary(start, refSeq, clientId);
        ensureIntervalBoundary(end, refSeq, clientId);
        let segmentGroup: TextSegmentGroup;
        function markRemoved(textSegment: TextSegment, pos: number, start: number, end: number) {
            if (textSegment.removedSeq >= 1) {
                console.log(`yump: overrote deleted segment ${textSegment.removedSeq} with more deletion`);
            }
            textSegment.removedClientId = clientId;
            textSegment.removedSeq = seq;
            // save segment so can assign removed sequence number when acked by server
            if (segmentWindow.collaborating && (textSegment.removedSeq == UnassignedSequenceNumber) && (clientId == segmentWindow.clientId)) {
                segmentGroup = addToPendingList(textSegment, segmentGroup);
                //console.log(`saved local removed seg with text: ${textSegment.text}`);
            }
            return true;
        }
        function afterMarkRemoved(node: TextSegmentBlock, pos: number, start: number, end: number) {
            nodeUpdateLength(node, seq, clientId);
            return true;
        }
        //    traceTraversal = true;
        mapRange({ leaf: markRemoved, post: afterMarkRemoved }, refSeq, clientId, undefined, start, end);
        traceTraversal = false;
    }

    function removeRange(start: number, end: number, refSeq: number, clientId: number) {
        nodeRemoveRange(root, start, end, refSeq, clientId);
    }

    function nodeRemoveRange(node: TextSegmentBlock, start: number, end: number, refSeq: number, clientId: number) {
        let segments = node.segments;
        let startIndex: number;
        if (start < 0) {
            startIndex = -1;
        }
        let endIndex = node.liveSegmentCount;
        for (let segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            let segment = segments[segmentIndex];
            let len = segmentLength(segment, refSeq, clientId);
            if ((start >= 0) && (start < len)) {
                startIndex = segmentIndex;
                if (segment.child) {
                    // internal node
                    nodeRemoveRange(segment.child, start, end, refSeq, clientId);
                }
                else {
                    let remnantString = "";
                    if (start > 0) {
                        remnantString += segment.text.substring(0, start);
                    }
                    if (end < len) {
                        remnantString += segment.text.substring(end);
                    }
                    segment.text = remnantString;
                    if (remnantString.length == 0) {
                        startIndex--;
                    }
                }
            }
            if (end < len) {
                endIndex = segmentIndex;
                if (end > 0) {
                    if (endIndex > startIndex) {
                        if (segment.child) {
                            nodeRemoveRange(segment.child, start, end, refSeq, clientId);
                        }
                        else {
                            segment.text = segment.text.substring(end);
                            if (segment.text.length == 0) {
                                endIndex++;
                            }
                        }
                    }
                }
                break;
            }
            start -= len;
            end -= len;
        }
        let deleteCount = (endIndex - startIndex) - 1;
        let deleteStart = startIndex + 1;
        if (deleteCount > 0) {
            // delete nodes in middle of range
            let copyStart = deleteStart + deleteCount;
            let copyCount = node.liveSegmentCount - copyStart;
            for (let j = 0; j < copyCount; j++) {
                segments[deleteStart + j] = segments[copyStart + j];
            }
            node.liveSegmentCount -= deleteCount;
        }
        nodeUpdateLengthNewStructure(node);
    }

    function nodeUpdateLengthNewStructure(node: TextSegmentBlock) {
        nodeUpdateTotalLength(node);
        if (segmentWindow.collaborating) {
            node.partialLengths = PartialSequenceLengths.combine(node, segmentWindow);
        }
    }

    function nodeUpdateTotalLength(node: TextSegmentBlock) {
        let len = 0;
        for (let i = 0; i < node.liveSegmentCount; i++) {
            len += segmentLength(node.segments[i], UniversalSequenceNumber, segmentWindow.clientId);
        }
        node.length = len;
    }

    function nodeUpdatePathLengths(node: TextSegmentBlock, seq: number, clientId: number) {
        while (node !== undefined) {
            nodeUpdateLength(node, seq, clientId);
            node = node.parent;
        }
    }

    function nodeUpdateLength(node: TextSegmentBlock, seq: number, clientId: number) {
        nodeUpdateTotalLength(node);
        if (segmentWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
            if ((node.partialLengths !== undefined) && (node.partialLengths.recentWindow(segmentWindow))) {
                node.partialLengths.update(node, seq, clientId, segmentWindow);
            }
            else {
                node.partialLengths = PartialSequenceLengths.combine(node, segmentWindow);
            }
        }
    }

    function map<TAccum>(actions: TextSegmentActions, refSeq: number, clientId: number, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        nodeMap(root, actions, 0, refSeq, clientId, accum);
    }

    function mapRange<TAccum>(actions: TextSegmentActions, refSeq: number, clientId: number, accum?: TAccum, start?: number, end?: number) {
        nodeMap(root, actions, 0, refSeq, clientId, accum, start, end);
    }

    let indentStrings = ["", " ", "  "];
    function indent(n: number) {
        if (indentStrings[n] === undefined) {
            indentStrings[n] = "";
            for (let i = 0; i < n; i++) {
                indentStrings[n] += " ";
            }
        }
        return indentStrings[n];
    }

    function toString() {
        let strbuf = "";
        function nodeToString(node: TextSegmentBlock, indentCount = 0) {
            strbuf += indent(indentCount);
            strbuf += `Node (len ${node.length}) p len (${node.parent ? node.parent.length : 0}) with ${node.liveSegmentCount} live segments:\n`;
            if (segmentWindow.collaborating) {
                strbuf += indent(indentCount);
                strbuf += node.partialLengths.toString() + '\n';
            }
            let segments = node.segments;
            for (let segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
                let segment = segments[segmentIndex];
                if (segment.child) {
                    nodeToString(segment.child, indentCount + 4);
                }
                else {
                    strbuf += indent(indentCount + 4);
                    strbuf += `cli: ${segment.clientId} seq: ${segment.seq}`;
                    if (segment.removedSeq !== undefined) {
                        strbuf += ` rcli: ${segment.removedClientId} rseq: ${segment.removedSeq}`;
                    }
                    strbuf += "\n";
                    strbuf += indent(indentCount + 4);
                    strbuf += segment.text;
                    strbuf += "\n";
                }
            }
        }
        nodeToString(root);
        return strbuf;
    }

    let traceTraversal = false;

    function nodeMap<TAccum>(node: TextSegmentBlock, actions: TextSegmentActions, pos: number, refSeq: number,
        clientId: number, accum?: TAccum, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = root.length;
        }
        let go = true;
        if (actions.pre) {
            go = actions.pre(node, pos, refSeq, clientId, start, end, accum);
        }
        let segments = node.segments;
        for (let segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            let segment = segments[segmentIndex];
            let len = segmentLength(segment, refSeq, clientId);
            if (traceTraversal) {
                let segInfo: string;
                if (segment.child && segmentWindow.collaborating) {
                    segInfo = `minLength: ${segment.child.partialLengths.minLength}`;
                }
                else {
                    segInfo = `cli: ${segment.clientId} seq: ${segment.seq} text: ${segment.text}`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${segment.removedClientId} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`len: ${len} start: ${start} end: ${end} ` + segInfo);
            }
            if (go && (len > 0) && (start < len) && (end > 0)) {
                // found entry containing pos
                if (segment.child) {
                    // internal node
                    if (go) {
                        go = nodeMap(segment.child, actions, pos, refSeq, clientId, accum, start, end);
                    }
                }
                else {
                    if (traceTraversal) {
                        console.log("leaf action");
                    }
                    go = actions.leaf(segment, pos, refSeq, clientId, start, end, accum);
                }
            }
            pos += len;
            start -= len;
            end -= len;
        }
        if (go && actions.post) {
            go = actions.post(node, pos, refSeq, clientId, start, end, accum);
        }

        return go;
    }

    function diag() {
        // TODO 
    }
    return {
        map: map,
        mapRange: mapRange,
        getOffset: getOffset,
        getContainingSegment: getContainingSegment,
        ensureIntervalBoundary: ensureIntervalBoundary,
        insertInterval: insertInterval,
        removeRange: removeRange,
        markRangeRemoved: markRangeRemoved,
        getText: getText,
        getLength: getLength,
        createMarker: createMarker,
        startCollaboration: startCollaboration,
        getSegmentWindow: getSegmentWindow,
        ackPendingSegment: ackPendingSegment,
        updateMinSeq: updateMinSeq,
        toString: toString,
        diag: diag
    }

}




