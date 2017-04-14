/// <reference path="base.d.ts" />

import * as ListUtil from "./list";
import * as BST from "./redBlack";
import * as Text from "./text";

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

export interface SearchResult {
    text: string;
    pos: number;
}

export interface SegmentTreeStats {
    maxHeight: number;
    nodeCount: number;
    leafCount: number;
    removedLeafCount: number;
    liveCount: number;
    histo: number[];
    windowTime?: number;
    packTime?: number;
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
    getStats(): SegmentTreeStats;
    searchFromPos(pos: number, regexp: RegExp): SearchResult;
    startCollaboration(localClientId);
    getSegmentWindow(): SegmentWindow;
    ackPendingSegment(seq: number);
    updateMinSeq(minSeq: number);
    reloadFromSegments(segments: TextSegment[]);
    diag();
}

export interface TextSegmentGroup {
    segments: TextSegment[];
}

export interface OverlapClient {
    clientId: number;
    seglen: number;
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
    removedClientOverlap?: number[];
}

// list of text segments
export interface TextSegmentBlock {
    liveSegmentCount: number;
    segments: TextSegment[];
    length: number;
    partialLengths?: PartialSequenceLengths;
    parent?: TextSegmentBlock;
    //    detached?: boolean;
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
    overlapClients?: BST.RedBlackTree<number, OverlapClient>;
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

function compareNumbers(a: number, b: number) {
    return a - b;
}

/**
 * Keep track of partial sums of segment lengths for all sequence numbers
 * in the current collaboration window (if any).  Only used during active
 * collaboration.
 */
class PartialSequenceLengths {
    minLength = 0;
    segmentCount = 0;
    partialLengths: PartialSequenceLength[] = [];
    clientSeqNumbers: PartialSequenceLength[][] = [];
    static options = {
        zamboni: true
    };

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

    compare(b: PartialSequenceLengths) {
        function comparePartialLengths(aList: PartialSequenceLength[], bList: PartialSequenceLength[]) {
            let aLen = aList.length;
            let bLen = bList.length;
            if (aLen != bLen) {
                return false;
            }
            for (let i = 0; i < aLen; i++) {
                let aPartial = aList[i];
                let bPartial = bList[i];
                if ((aPartial.seq != bPartial.seq) || (aPartial.clientId != bPartial.clientId) ||
                    (aPartial.seglen != bPartial.seglen) || (aPartial.len != bPartial.len) || (aPartial.overlapClients && (!bPartial.overlapClients))) {
                    return false;
                }
            }
            return true;
        }
        if (!comparePartialLengths(this.partialLengths, b.partialLengths)) {
            return false;
        }
        for (let clientId in this.clientSeqNumbers) {
            if (!b.clientSeqNumbers[clientId]) {
                return false;
            }
            else if (!comparePartialLengths(this.clientSeqNumbers[clientId], b.clientSeqNumbers[clientId])) {
                return false;
            }
        }
        return true;
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
        return `min: ${this.minLength}; sc: ${this.segmentCount};` + buf;
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

    addClientSeqNumber(clientId: number, seq: number, seglen: number) {
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        let cli = this.clientSeqNumbers[clientId];
        let pLen = seglen;
        if (cli.length > 0) {
            pLen += cli[cli.length - 1].len;
        }
        cli.push({ seq: seq, len: pLen, seglen: seglen });

    }
    // assumes sequence number already coalesced
    addClientSeqNumberFromPartial(partialLength: PartialSequenceLength) {
        this.addClientSeqNumber(partialLength.clientId, partialLength.seq, partialLength.seglen);
        if (partialLength.overlapClients) {
            partialLength.overlapClients.map((oc: Base.Property<number, OverlapClient>) => {
                this.addClientSeqNumber(oc.data.clientId, partialLength.seq, oc.data.seglen);
                return true;
            });
        }
    }

    // assume: seq is latest sequence number; no structural change to sub-tree, but a segment
    // with sequence number seq has been added within the sub-tree
    // TODO: assert client id matches
    update(node: TextSegmentBlock, seq: number, clientId: number, segmentWindow: SegmentWindow) {
        let seqSeglen = 0;
        let segCount = 0;
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
                segCount += segment.child.partialLengths.segmentCount;
            }
            else {
                if (segment.seq == seq) {
                    seqSeglen += segment.text.length;
                }
                else if (segment.removedSeq == seq) {
                    seqSeglen -= segment.text.length;
                }
                segCount++;
            }
        }
        this.segmentCount = segCount;

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
        if (PartialSequenceLengths.options.zamboni) {
            this.zamboni(segmentWindow);
        }
        //   console.log('ZZZ');
        //   console.log(this.toString());
    }

    static fromLeaves(combinedPartialLengths: PartialSequenceLengths, textSegmentBlock: TextSegmentBlock, segmentWindow: SegmentWindow) {
        combinedPartialLengths.minLength = 0;
        combinedPartialLengths.segmentCount = textSegmentBlock.liveSegmentCount;

        function getOverlapClients(overlapClientids: number[], seglen: number) {
            let bst = new BST.RedBlackTree<number, OverlapClient>(compareNumbers);
            for (let clientId of overlapClientids) {
                bst.put(clientId, <OverlapClient>{ clientId: clientId, seglen: seglen });
            }
            return bst;
        }

        function accumulateClientOverlap(partialLength: PartialSequenceLength, overlapClientIds: number[], seglen: number) {
            if (partialLength.overlapClients) {
                for (let clientId of overlapClientIds) {
                    let ovlapClientNode = partialLength.overlapClients.get(clientId);
                    if (!ovlapClientNode) {
                        partialLength.overlapClients.put(clientId, <OverlapClient>{ clientId: clientId, seglen: seglen });
                    }
                    else {
                        ovlapClientNode.data.seglen += seglen;
                    }
                }
            }
            else {
                partialLength.overlapClients = getOverlapClients(overlapClientIds, seglen);
            }
        }

        function insertSegment(segment: TextSegment, removedSeq = false) {
            let seq = segment.seq;
            let segmentLen = segment.text.length;
            let clientId = segment.clientId;
            let removedClientOverlap: number[];

            if (removedSeq) {
                seq = segment.removedSeq;
                segmentLen = -segmentLen;
                clientId = segment.removedClientId;
                if (segment.removedClientOverlap) {
                    removedClientOverlap = segment.removedClientOverlap;
                }
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
                if (removedClientOverlap) {
                    accumulateClientOverlap(seqPartials[indexFirstGTE], removedClientOverlap, segmentLen);
                }
            }
            else {
                let pLen: PartialSequenceLength;
                if (removedClientOverlap) {
                    let overlapClients = getOverlapClients(removedClientOverlap, segmentLen);
                    pLen = { seq: seq, clientId: clientId, len: 0, seglen: segmentLen, overlapClients: overlapClients };
                }
                else {
                    pLen = { seq: seq, clientId: clientId, len: 0, seglen: segmentLen };
                }

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
            combinedPartialLengths.addClientSeqNumberFromPartial(seqPartials[i]);
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

        function combineOverlapClients(a: PartialSequenceLength, b: PartialSequenceLength) {
            if (a.overlapClients) {
                if (b.overlapClients) {
                    b.overlapClients.map((bProp: Base.Property<number, OverlapClient>) => {
                        let aProp = a.overlapClients.get(bProp.key);
                        if (aProp) {
                            aProp.data.seglen += bProp.data.seglen;
                        }
                        else {
                            a.overlapClients.put(bProp.data.clientId, bProp.data);
                        }
                        return true;
                    });
                }
            }
            else {
                a.overlapClients = b.overlapClients;
            }
        }

        function addNext(partialLength: PartialSequenceLength) {
            let seq = partialLength.seq;
            let pLen = 0;

            if (prevPartial) {
                if (prevPartial.seq == partialLength.seq) {
                    prevPartial.seglen += partialLength.seglen;
                    prevPartial.len += partialLength.seglen;
                    combineOverlapClients(prevPartial, partialLength);
                    return;
                }
                else {
                    pLen = prevPartial.len;
                    // previous sequence number is finished
                    combinedPartialLengths.addClientSeqNumberFromPartial(prevPartial);
                }
            }
            prevPartial = {
                seq: seq,
                clientId: partialLength.clientId,
                len: pLen + partialLength.seglen,
                seglen: partialLength.seglen,
                overlapClients: partialLength.overlapClients
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
                combinedPartialLengths.segmentCount += childPartials[i].segmentCount;
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
                combinedPartialLengths.addClientSeqNumberFromPartial(prevPartial);
            }
        }
        // TODO: incremental zamboni during build
        //console.log(combinedPartialLengths.toString());
        //console.log(`ZZZ...(min ${segmentWindow.minSeq})`);
        if (PartialSequenceLengths.options.zamboni) {
            combinedPartialLengths.zamboni(segmentWindow);
        }
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

function removeFromSegmentGroup(segmentGroup: TextSegmentGroup, toRemove: TextSegment) {
    let index = segmentGroup.segments.indexOf(toRemove);
    if (index >= 0) {
        segmentGroup.segments.splice(index, 1);
    }
    toRemove.segmentGroup = undefined;
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
        segmentGroup: textSegment.segmentGroup,
        removedClientOverlap: textSegment.removedClientOverlap
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

export const enum MsgType {
    INSERT,
    REMOVE
}

export interface DeltaMsg {
    /**
     * Type of this change.
     */
    type: MsgType;
    /**
     * Sequence number of this change.  Added by the server.
     */
    seq: number;
    /**
     * Last sequence number processed by client before sending this message.
     */
    refSeq: number;
    /**
     * Unique identifier for client initiating this change.
     */
    clientId: number;
    /**
     * Client's sequence number.  
     */
    clientSeq: number;
    pos1: number;
    pos2?: number;
    text?: string;
    /**
     * Sent by server; minumum ref seq across clients.
     */
    minseq?: number;
}

export function makeInsertMsg(text: string, pos: number, seq: number, refSeq: number, clientId: number) {
    return <DeltaMsg>{ type: MsgType.INSERT, text: text, pos1: pos, seq: seq, refSeq: refSeq, clientId: clientId };
}

export function makeRemoveMsg(start: number, end: number, seq: number, refSeq: number, clientId: number) {
    return <DeltaMsg>{ type: MsgType.REMOVE, pos1: start, pos2: end, seq: seq, refSeq: refSeq, clientId: clientId };
}


/**
 * Used for in-memory testing.  This will queue a reference string for each client message.
 */
export const useCheckQ = false;

function checkTextMatchRelative(refSeq: number, clientId: number, server: TestServer, msg: DeltaMsg) {
    let client = server.clients[clientId];
    let serverText = server.segTree.getText(refSeq, clientId);
    let cliText = client.checkQ.dequeue();
    if ((cliText === undefined) || (cliText != serverText)) {
        console.log(`mismatch `);
        console.log(msg);
        //        console.log(serverText);
        //        console.log(cliText);
        console.log(server.segTree.toString());
        console.log(client.segTree.toString());
        return true;
    }
    return false;
}


export class Client {
    segTree: SegmentTree;
    accumTime = 0;
    localTime = 0;
    localOps = 0;
    accumWindowTime = 0;
    maxWindowTime = 0;
    accumWindow = 0;
    accumOps = 0;
    verboseOps = false;
    measureOps = true;
    q: ListUtil.List<DeltaMsg>;
    checkQ: ListUtil.List<string>;

    constructor(initText: string) {
        this.segTree = segmentTree(initText);
        this.q = ListUtil.ListMakeHead<DeltaMsg>();
        this.checkQ = ListUtil.ListMakeHead<string>();
    }

    enqueueMsg(msg: DeltaMsg) {
        this.q.enqueue(msg);
    }

    enqueueTestString() {
        this.checkQ.enqueue(this.getText());
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

        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.segTree.markRangeRemoved(start, end, refSeq, clientId, seq);

        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`remove local cli ${clientId} ref seq ${refSeq}`);
        }
    }

    removeSegmentRemote(start: number, end: number, seq: number, refSeq: number, clientId: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.segTree.markRangeRemoved(start, end, refSeq, clientId, seq);
        this.segTree.getSegmentWindow().currentSeq = seq;

        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.segTree.getSegmentWindow().minSeq);
        }
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
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.segTree.insertInterval(pos, refSeq, clientId, seq, textSegment);

        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
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
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.segTree.insertInterval(pos, refSeq, clientId, seq, textSegment);
        this.segTree.getSegmentWindow().currentSeq = seq;

        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.segTree.getSegmentWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.segTree.getSegmentWindow().clientId} text ${text} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${clientId}`);
        }
    }

    ackPendingSegment(seq: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.segTree.ackPendingSegment(seq);
        this.segTree.getSegmentWindow().currentSeq = seq;

        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.segTree.getSegmentWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.segTree.getSegmentWindow().clientId} ack seq # ${seq}`);
        }
    }

    updateMinSeq(minSeq: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.segTree.updateMinSeq(minSeq);

        if (this.measureOps) {
            let elapsed = elapsedMicroseconds(clockStart);
            this.accumWindowTime += elapsed;
            if (elapsed > this.maxWindowTime) {
                this.maxWindowTime = elapsed;
            }
        }
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

export interface ClientSeq {
    refSeq: number;
    clientId: number;
}

export var clientSeqComparer: BST.Comparer<ClientSeq> = {
    min: { refSeq: -1, clientId: -1 },
    compare: (a, b) => a.refSeq - b.refSeq
}

/**
 * Server for tests.  Simulates client communication by directing placing
 * messages in client queues.  
 */
export class TestServer extends Client {
    seq = 1;
    clients: Client[];
    clientSeqNumbers: BST.Heap<ClientSeq>;

    constructor(initText: string) {
        super(initText);
    }

    addClients(clients: Client[]) {
        this.clientSeqNumbers = new BST.Heap<ClientSeq>([], clientSeqComparer);
        this.clients = clients;
        for (let client of clients) {
            this.clientSeqNumbers.add({ refSeq: client.getCurrentSeq(), clientId: client.getClientId() });
        }
    }

    applyMsg(msg: DeltaMsg) {
        this.coreApplyMsg(msg);
        if (useCheckQ) {
            return checkTextMatchRelative(msg.refSeq, msg.clientId, this, msg);
        }
        else {
            return false;
        }
    }

    applyMessages(msgCount: number) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                msg.seq = this.seq++;
                if (this.applyMsg(msg)) {
                    return true;
                }
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
        return false;
    }
}

interface LRUSegment {
    segment?: TextSegment;
    maxSeq: number;
}

var LRUSegmentComparer: BST.Comparer<LRUSegment> = {
    min: { maxSeq: -2 },
    compare: (a, b) => a.maxSeq - b.maxSeq
}

// represents a sequence of text segments
export function segmentTree(text: string): SegmentTree {
    // must be an even number   
    const MaxSegments = 8;
    const TextSegmentGranularity = 128;
    let windowTime = 0;
    let packTime = 0;

    const options = {
        incrementalUpdate: true,
        zamboniSegments: true,
        measureWindowTime: true,
    };

    function makeNode(liveSegmentCount: number) {
        return <TextSegmentBlock>{
            liveSegmentCount: liveSegmentCount,
            segments: <TextSegment[]>new Array(MaxSegments)
        };
    }

    function initialNode(text: string) {
        let node = makeNode(1);
        node.segments[0] = makeLeafSegment(node, text, UniversalSequenceNumber, LocalClientId);
        node.length = text.length;
        return node;
    }

    function addSegment(node: TextSegmentBlock, segment: TextSegment) {
        node.segments[node.liveSegmentCount++] = segment;
        segment.parent = node;
        if (segment.child) {
            segment.child.parent = node;
        }
    }

    function reloadFromSegments(segments: TextSegment[]) {
        let segCap = MaxSegments - 1;
        const measureReloadTime = true;
        function buildSegmentTree(segments: TextSegment[]): TextSegment {
            const segmentCount = Math.ceil(segments.length / segCap);
            const internalSegments: TextSegment[] = [];
            let segmentIndex = 0;
            for (let i = 0; i < segmentCount; i++) {
                let len = 0;
                internalSegments[i] = makeInternalSegment(undefined, makeNode(0));
                for (let j = 0; j < segCap; j++) {
                    if (segmentIndex < segments.length) {
                        addSegment(internalSegments[i].child, segments[segmentIndex]);
                        len += segmentLength(segments[segmentIndex], UniversalSequenceNumber, LocalClientId);
                    } else {
                        break;
                    }
                    segmentIndex++;
                }
                internalSegments[i].child.length = len;
            }
            if (internalSegments.length == 1) {
                return internalSegments[0];
            }
            else {
                return buildSegmentTree(internalSegments);
            }
        }
        let clockStart;
        if (measureReloadTime) {
            clockStart = clock();
        }
        root = makeNode(1);
        let segTree = buildSegmentTree(segments);
        segTree.parent = root;
        if (segTree.child) {
            segTree.child.parent = root;
        }
        root.segments[0] = segTree;
        root.length = segmentLength(root.segments[0], UniversalSequenceNumber, LocalClientId);
        if (measureReloadTime) {
            console.log(`reload time ${elapsedMicroseconds(clockStart)}`);
        }
    }

    let root = initialNode(text);
    let segmentWindow = new SegmentWindow();
    let pendingSegments: ListUtil.List<TextSegmentGroup>;
    let segmentsToScour: BST.Heap<LRUSegment>;

    // for now assume min starts at zero
    function startCollaboration(localClientId: number) {
        segmentWindow.clientId = localClientId;
        segmentWindow.minSeq = 0;
        segmentWindow.collaborating = true;
        segmentWindow.currentSeq = 0;
        segmentsToScour = new BST.Heap<LRUSegment>([], LRUSegmentComparer);
        pendingSegments = ListUtil.ListMakeHead<TextSegmentGroup>();
        let measureFullCollab = true;
        let clockStart;
        if (measureFullCollab) {
            clockStart = clock();
        }
        nodeUpdateLengthNewStructure(root, true);
        if (measureFullCollab) {
            console.log(`update partial lengths at start ${elapsedMicroseconds(clockStart)}`);
        }
    }

    function addToLRUSet(segment: TextSegment, seq: number) {
        segmentsToScour.add({ segment: segment, maxSeq: seq });
    }

    function underflow(node: TextSegmentBlock) {
        return node.liveSegmentCount < (MaxSegments / 2);
    }

    function scourNode(node: TextSegmentBlock, holdSegments: TextSegment[]) {
        let prevSegment: TextSegment;
        for (let k = 0; k < node.liveSegmentCount; k++) {
            let segment = node.segments[k];
            if ((segment.removedSeq != undefined) && (segment.removedSeq != UnassignedSequenceNumber)) {
                if (segment.removedSeq > segmentWindow.minSeq) {
                    holdSegments.push(segment);
                }
                else {
                    //                          console.log(`removed rseq ${segment.removedSeq}`);
                    segment.parent = undefined;
                }
                prevSegment = undefined;
            }
            else {
                if ((!segment.child) && (segment.seq <= segmentWindow.minSeq) &&
                    (!segment.segmentGroup) && (segment.seq != UnassignedSequenceNumber)) {
                    if (prevSegment && canExtendRight(prevSegment) && ((prevSegment.text.length <= TextSegmentGranularity) || (segment.text.length <= TextSegmentGranularity))) {
                        extendSegment(prevSegment, segment);
                        segment.parent = undefined;
                    }
                    else {
                        holdSegments.push(segment);
                        prevSegment = segment;
                    }
                }
                else {
                    holdSegments.push(segment);
                    prevSegment = undefined;
                }
            }
        }
    }

    // interior node with all node children
    function pack(node: TextSegmentBlock) {
        let parent = node.parent;
        let segments = parent.segments;
        let segmentIndex: number;
        let segment: TextSegment;
        let holdSegments = <TextSegment[]>[];
        for (segmentIndex = 0; segmentIndex < parent.liveSegmentCount; segmentIndex++) {
            segment = segments[segmentIndex];
            scourNode(segment.child, holdSegments);
        }
        let totalSegmentCount = holdSegments.length;
        let halfCount = MaxSegments / 2;
        let childCount = Math.min(MaxSegments - 1, Math.floor(totalSegmentCount / halfCount));
        if (childCount < 1) {
            childCount = 1;
        }
        let baseCount = Math.floor(totalSegmentCount / childCount);
        let extraCount = totalSegmentCount % childCount;
        let parentSegments = <TextSegment[]>new Array(MaxSegments);
        let readCount = 0;
        for (let nodeIndex = 0; nodeIndex < childCount; nodeIndex++) {
            let segmentCount = baseCount;
            if (extraCount > 0) {
                segmentCount++;
                extraCount--;
            }
            let packedNode = makeNode(segmentCount);
            for (let packedSegmentIndex = 0; packedSegmentIndex < segmentCount; packedSegmentIndex++) {
                let segToPack = holdSegments[readCount++];
                packedNode.segments[packedSegmentIndex] = segToPack;
                segToPack.parent = packedNode;
                if (segToPack.child) {
                    segToPack.child.parent = packedNode;
                }
            }
            let packedNodeSegment = makeInternalSegment(parent, packedNode);
            parentSegments[nodeIndex] = packedNodeSegment;
            nodeUpdateLengthNewStructure(packedNode);
        }
        if (readCount != totalSegmentCount) {
            console.log(`total count ${totalSegmentCount} readCount ${readCount}`);
        }
        parent.segments = parentSegments;
        parent.liveSegmentCount = childCount;
        if (underflow(parent) && (parent.parent)) {
            pack(parent);
        }
        else {
            nodeUpdatePathLengths(parent, UnassignedSequenceNumber, -1, true);
        }
    }

    function canExtendRight(segment: TextSegment) {
        return (!segment.removedSeq) && (segment.text.charAt(segment.text.length - 1) != '\n');
    }

    // assume: both segments are leaves and have seq <= minSeq; segments not part of segment group
    function extendSegment(prevSegment: TextSegment, segment: TextSegment) {
        //console.log(`extending seq ${prevSegment.seq} text ${prevSegment.text} with seq ${segment.seq} text ${segment.text}`);
        prevSegment.text += segment.text;
    }

    const zamboniSegmentsMaxCount = 2;
    function zamboniSegments() {
        //console.log(`scour line ${segmentsToScour.count()}`);
        let clockStart;
        if (options.measureWindowTime) {
            clockStart = clock();
        }

        let segmentToScour = segmentsToScour.peek();
        if (segmentToScour && (segmentToScour.maxSeq <= segmentWindow.minSeq)) {
            for (let i = 0; i < zamboniSegmentsMaxCount; i++) {
                segmentToScour = segmentsToScour.get();
                if (segmentToScour && segmentToScour.segment.parent && (segmentToScour.maxSeq <= segmentWindow.minSeq)) {
                    let node = segmentToScour.segment.parent;
                    let segmentsCopy = <TextSegment[]>[];
                    //                console.log(`scouring from ${segmentToScour.segment.seq}`);
                    scourNode(node, segmentsCopy);
                    let newLiveSegmentCount = segmentsCopy.length;

                    if (newLiveSegmentCount < node.liveSegmentCount) {
                        node.liveSegmentCount = newLiveSegmentCount;
                        node.segments = segmentsCopy;

                        if (underflow(node) && node.parent) {
                            //nodeUpdatePathLengths(node, UnassignedSequenceNumber, -1, true);
                            let packClockStart;
                            if (options.measureWindowTime) {
                                packClockStart = clock();
                            }
                            pack(node);
                            if (options.measureWindowTime) {
                                packTime += elapsedMicroseconds(packClockStart);
                            }
                        }
                        else {
                            nodeUpdatePathLengths(node, UnassignedSequenceNumber, -1, true);
                        }

                    }
                }
                else {
                    break;
                }
            }
        }

        if (options.measureWindowTime) {
            windowTime += elapsedMicroseconds(clockStart);
        }
    }

    function getSegmentWindow() {
        return segmentWindow;
    }

    function getStats() {
        function nodeGetStats(node: TextSegmentBlock) {
            let stats = { maxHeight: 0, nodeCount: 0, leafCount: 0, removedLeafCount: 0, liveCount: 0, histo: [] };
            for (let k = 0; k < MaxSegments; k++) {
                stats.histo[k] = 0;
            }
            for (let i = 0; i < node.liveSegmentCount; i++) {
                let segment = node.segments[i];
                let height = 1;
                if (segment.child) {
                    let childStats = nodeGetStats(segment.child);
                    height = 1 + childStats.maxHeight;
                    stats.nodeCount += childStats.nodeCount;
                    stats.leafCount += childStats.leafCount;
                    stats.removedLeafCount += childStats.removedLeafCount;
                    stats.liveCount += childStats.liveCount;
                    for (let i = 0; i < MaxSegments; i++) {
                        stats.histo[i] += childStats.histo[i];
                    }
                }
                else {
                    stats.leafCount++;
                    if (segment.removedSeq !== undefined) {
                        stats.removedLeafCount++;
                    }
                }
                if (height > stats.maxHeight) {
                    stats.maxHeight = height;
                }
            }
            stats.histo[node.liveSegmentCount]++;
            stats.nodeCount++;
            stats.liveCount += node.liveSegmentCount;
            return stats;
        }
        let rootStats = <SegmentTreeStats>nodeGetStats(root);
        if (options.measureWindowTime) {
            rootStats.windowTime = windowTime;
            rootStats.packTime = packTime;
        }
        return rootStats;
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

    const searchChunkSize = 256;
    function searchFromPos(pos: number, target: RegExp) {
        let start = pos;
        let end = pos + searchChunkSize;
        let chunk = "";
        let found = false;
        while (!found) {
            if (end > root.length) {
                end = root.length;
            }
            chunk += getText(UniversalSequenceNumber, segmentWindow.clientId, start, end);
            let result = chunk.match(target);
            if (result !== null) {
                return { text: result[0], pos: result.index };
            }
            start += searchChunkSize;
            if (start >= root.length) {
                break;
            }
            end += searchChunkSize;
        }
    }

    let traceGatherText = false;
    function gatherText(textSegment: TextSegment, pos: number, refSeq: number, clientId: number, start: number, end: number, accumText: TextSegment) {
        if ((textSegment.removedSeq === undefined) || (textSegment.removedSeq == UnassignedSequenceNumber) || (textSegment.removedSeq > refSeq)) {
            if (traceGatherText) {
                console.log(`@cli ${segmentWindow.clientId} gather seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
            }
            if ((start <= 0) && (end >= textSegment.text.length)) {
                accumText.text += textSegment.text;
            }
            else {
                if (end >= textSegment.text.length) {
                    accumText.text += textSegment.text.substring(start);
                }
                else {
                    accumText.text += textSegment.text.substring(start, end);
                }
            }
        }
        else {
            if (traceGatherText) {
                console.log(`ignore seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
            }
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
        if (traceGatherText) {
            console.log(`get text on cli ${segmentWindow.clientId} ref cli ${clientId} refSeq ${refSeq}`);
        }
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
                            (segment.removedClientOverlap && (segment.removedClientOverlap.indexOf(clientId) >= 0)) ||
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
        if (options.zamboniSegments) {
            zamboniSegments();
        }
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

    function updateRoot(splitNode: TextSegmentBlock, refSeq: number, clientId: number, seq: number) {
        if (splitNode !== undefined) {
            let newRoot = makeNode(2);
            newRoot.segments[0] = makeInternalSegment(newRoot, root);
            newRoot.segments[1] = makeInternalSegment(newRoot, splitNode);
            root = newRoot;
            nodeUpdateLengthNewStructure(root);
        }
    }

    /**
     * Assign sequence number to existing segment; update partial lengths to reflect the change
     * @param seq sequence number given by server to pending segment
     */
    function ackPendingSegment(seq: number) {
        let pendingSegmentGroup = pendingSegments.dequeue();
        let nodesToUpdate = <TextSegmentBlock[]>[];
        let clientId: number;
        let overwrite = false;
        if (pendingSegmentGroup !== undefined) {
            pendingSegmentGroup.segments.map((pendingSegment) => {
                if (pendingSegment.seq == UnassignedSequenceNumber) {
                    pendingSegment.seq = seq;
                }
                else {
                    if (pendingSegment.removedSeq !== undefined) {
                        if (pendingSegment.removedSeq != UnassignedSequenceNumber) {
                            overwrite = true;
                            if (diagOverlappingRemove) {
                                console.log(`grump @seq ${seq} cli ${segmentWindow.clientId} from ${pendingSegment.removedSeq} text ${pendingSegment.text}`);
                            }
                        }
                        else {
                            pendingSegment.removedSeq = seq;
                        }
                    }
                }
                pendingSegment.segmentGroup = undefined;
                clientId = segmentWindow.clientId;
                if (nodesToUpdate.indexOf(pendingSegment.parent) < 0) {
                    nodesToUpdate.push(pendingSegment.parent);
                }
            });
            for (let node of nodesToUpdate) {
                nodeUpdatePathLengths(node, seq, clientId, overwrite);
                //nodeUpdatePathLengths(node, seq, clientId, true);
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
        //traceTraversal = true;
        let splitNode = nodeInsertBefore(root, pos, refSeq, clientId, textSegment);
        //traceTraversal = false;
        updateRoot(splitNode, refSeq, clientId, seq);
        if (segmentWindow.collaborating && options.zamboniSegments && seq != UnassignedSequenceNumber) {
            zamboniSegments();
        }
    }

    let diagInsertTie = false;
    function nodeInsertBefore(node: TextSegmentBlock, pos: number, refSeq: number, clientId: number, textSegment: TextSegment) {
        let segIsLocal = false;
        function checkSegmentIsLocal(textSegment: TextSegment, pos: number, refSeq: number, clientId: number) {
            if (textSegment.seq == UnassignedSequenceNumber) {
                if (diagInsertTie) {
                    console.log(`@cli ${segmentWindow.clientId}: promoting continue due to seq ${textSegment.seq} text ${textSegment.text} ref ${refSeq}`);
                }
                segIsLocal = true;
            }
            // only need to look at first segment that follows finished node
            return false;
        }

        function continueFrom(node: TextSegmentBlock) {
            segIsLocal = false;
            excursion(node, checkSegmentIsLocal);
            if (diagInsertTie && segIsLocal) {
                console.log(`@cli ${segmentWindow.clientId}: attempting continue with seq ${textSegment.seq} text ${textSegment.text} ref ${refSeq}`);
            }
            return segIsLocal;
        }

        function onLeaf(segment: TextSegment, pos: number) {
            function saveIfLocal(locSegment: TextSegment) {
                // save segment so can assign sequence number when acked by server
                if (segmentWindow.collaborating) {
                    if ((locSegment.seq == UnassignedSequenceNumber) && (clientId == segmentWindow.clientId)) {
                        addToPendingList(locSegment);
                    }
                    else if ((locSegment.seq >= segmentWindow.minSeq) && options.zamboniSegments) {
                        addToLRUSet(locSegment, locSegment.seq);
                    }
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
                segment.removedClientOverlap = undefined;
                saveIfLocal(segment);
                return newSegment;
            }
        }
        return insertingWalk(node, pos, refSeq, clientId, textSegment.seq, onLeaf, continueFrom);
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
        updateRoot(splitNode, refSeq, clientId, TreeMaintainanceSequenceNumber);
    }

    // assume caled only when pos == len
    function breakTie(pos: number, len: number, seq: number, segment: TextSegment, refSeq: number, clientId: number) {
        if (segment.child) {
            return true;
        }
        else {
            if (pos == 0) {
                return segment.seq != UnassignedSequenceNumber;
            }
            return false;
        }
    }

    // visit segments starting from node's right siblings, then up to node's parent
    function excursion(node: TextSegmentBlock, leafAction: TextSegmentAction) {
        let actions = { leaf: leafAction };
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            let segments = parent.segments;
            let segmentIndex: number;
            let segment: TextSegment;
            let matchedStart = false;
            for (segmentIndex = 0; segmentIndex < parent.liveSegmentCount; segmentIndex++) {
                segment = segments[segmentIndex];
                if (matchedStart) {
                    if (segment.child) {
                        go = nodeMap(segment.child, actions, 0, UniversalSequenceNumber, segmentWindow.clientId,
                            undefined);
                    }
                    else {
                        go = leafAction(segment, 0, UniversalSequenceNumber, segmentWindow.clientId, 0, 0);
                    }
                    if (!go) {
                        return;
                    }
                }
                else {
                    matchedStart = (startNode === segment.child);
                }
            }
            startNode = parent;
            parent = parent.parent;
        }
    }

    let theUnfinishedNode = <TextSegmentBlock>{ liveSegmentCount: -1 };
    let theSuccessfulShiftNode = <TextSegmentBlock>{ liveSegmentCount: -2 };
    function insertingWalk(node: TextSegmentBlock, pos: number, refSeq: number, clientId: number, seq: number,
        leafAction: (segment: TextSegment, pos: number) => TextSegment,
        continuePredicate?: (continueFromNode: TextSegmentBlock) => boolean) {
        let segments = node.segments;
        let segmentIndex: number;
        let segment: TextSegment;
        let newSegment: TextSegment;
        let found = false;
        for (segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            segment = segments[segmentIndex];
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
                console.log(`@tcli: ${segmentWindow.clientId} len: ${len} pos: ${pos} ` + segInfo);
            }

            if ((pos < len) || ((pos == len) && breakTie(pos, len, seq, segment, refSeq, clientId))) {
                // found entry containing pos
                found = true;
                if (segment.child) {
                    //internal node
                    let splitNode = insertingWalk(segment.child, pos, refSeq, clientId, seq, leafAction, continuePredicate);
                    if (splitNode === undefined) {
                        nodeUpdateLength(node, seq, clientId);
                        return undefined;
                    }
                    else if (splitNode == theUnfinishedNode) {
                        if (traceTraversal) {
                            console.log(`@cli ${segmentWindow.clientId} unfinished bus pos ${pos} len ${len}`);
                        }
                        pos -= len; // act as if shifted segment
                        continue;
                    }
                    else if (splitNode == theSuccessfulShiftNode) {
                        nodeUpdateLengthNewStructure(node);
                        return undefined;
                    }
                    else {
                        newSegment = makeInternalSegment(node, splitNode);
                        segmentIndex++; // insert after
                    }
                }
                else {
                    if (traceTraversal) {
                        console.log(`@tcli: ${segmentWindow.clientId}: leaf action`);
                    }

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
                // TODO: look ahead to see if we should shift next segment
                if ((seq != UnassignedSequenceNumber) && continuePredicate && continuePredicate(node)) {
                    return theUnfinishedNode;
                }
                else {
                    if (traceTraversal) {
                        console.log(`@tcli: ${segmentWindow.clientId}: leaf action pos 0`);
                    }
                    newSegment = leafAction(undefined, pos);
                }
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

    function getLeftSibling(node: TextSegmentBlock) {
        let parent = node.parent;
        if (parent) {
            let segments = parent.segments;
            let segmentIndex: number;
            let segment: TextSegment;
            let prevSegment: TextSegment;
            for (segmentIndex = 0; segmentIndex < parent.liveSegmentCount; segmentIndex++) {
                segment = segments[segmentIndex];
                if (segment.child && (segment.child == node)) {
                    return prevSegment;
                }
                prevSegment = segment;
            }
        }
    }

    function tryShiftLeft(node: TextSegmentBlock) {
        let leftSib = getLeftSibling(node);
        if (leftSib && leftSib.child) {
            let leftNode = leftSib.child;
            if (leftNode.liveSegmentCount <= (MaxSegments / 2)) {
                let leftSegments = leftNode.segments;
                let segments = node.segments;
                let leftCapacity = (MaxSegments - 1) - leftNode.liveSegmentCount;
                for (let k = 0; k < leftCapacity; k++) {
                    let shiftSegment = segments[k];
                    leftSegments[k + leftNode.liveSegmentCount] = shiftSegment;
                    shiftSegment.parent = leftNode;
                    if (shiftSegment.child) {
                        shiftSegment.child.parent = leftNode;
                    }
                    segments[k] = segments[k + leftCapacity];
                }
                leftNode.liveSegmentCount += leftCapacity;
                node.liveSegmentCount = node.liveSegmentCount - leftCapacity;
                for (let k = leftCapacity; k < node.liveSegmentCount; k++) {
                    segments[k] = segments[k + leftCapacity];
                }
                nodeUpdateLengthNewStructure(node);
                nodeUpdatePathLengths(leftNode, UniversalSequenceNumber, -1, true);
                return true;
            }
        }
        return false;
    }

    let skipLeftShift = true;
    function split(node: TextSegmentBlock) {
        if (skipLeftShift || (!tryShiftLeft(node))) {
            let halfCount = MaxSegments / 2;
            let newNode = makeNode(halfCount);
            node.liveSegmentCount = halfCount;
            for (let i = 0; i < halfCount; i++) {
                newNode.segments[i] = node.segments[halfCount + i];
                newNode.segments[i].parent = newNode;
                if (newNode.segments[i].child) {
                    newNode.segments[i].child.parent = newNode;
                }
            }
            nodeUpdateLengthNewStructure(node);
            nodeUpdateLengthNewStructure(newNode);
            return newNode;
        }
        else {
            return theSuccessfulShiftNode;
        }
    }

    function addOverlappingClient(textSegment: TextSegment, clientId: number) {
        if (!textSegment.removedClientOverlap) {
            textSegment.removedClientOverlap = <number[]>[];
        }
        if (diagOverlappingRemove) {
            console.log(`added cli ${clientId} to rseq: ${textSegment.removedSeq} text ${textSegment.text}`);
        }
        textSegment.removedClientOverlap.push(clientId);
    }

    let diagOverlappingRemove = false;
    function markRangeRemoved(start: number, end: number, refSeq: number, clientId: number, seq: number) {
        ensureIntervalBoundary(start, refSeq, clientId);
        ensureIntervalBoundary(end, refSeq, clientId);
        let segmentGroup: TextSegmentGroup;
        let overwrite = false;
        function markRemoved(textSegment: TextSegment, pos: number, start: number, end: number) {
            if (textSegment.removedSeq != undefined) {
                if (diagOverlappingRemove) {
                    console.log(`yump @seq ${seq} cli ${segmentWindow.clientId}: overlaps deleted segment ${textSegment.removedSeq} text ${textSegment.text}`);
                }
                overwrite = true;
                if (textSegment.removedSeq == UnassignedSequenceNumber) {
                    // replace because comes later
                    textSegment.removedClientId = clientId;
                    textSegment.removedSeq = seq;
                    removeFromSegmentGroup(textSegment.segmentGroup, textSegment);
                }
                else {
                    // do not replace earlier sequence number for remove
                    addOverlappingClient(textSegment, clientId);
                }
            }
            else {
                textSegment.removedClientId = clientId;
                textSegment.removedSeq = seq;
            }
            // save segment so can assign removed sequence number when acked by server
            if (segmentWindow.collaborating && options.zamboniSegments) {
                if ((textSegment.removedSeq == UnassignedSequenceNumber) && (clientId == segmentWindow.clientId)) {
                    segmentGroup = addToPendingList(textSegment, segmentGroup);
                }
                else {
                    addToLRUSet(textSegment, seq);
                }
                //console.log(`saved local removed seg with text: ${textSegment.text}`);
            }
            return true;
        }
        function afterMarkRemoved(node: TextSegmentBlock, pos: number, start: number, end: number) {
            if (overwrite) {
                nodeUpdateLengthNewStructure(node);
            }
            else {
                nodeUpdateLength(node, seq, clientId);
            }
            return true;
        }
        //traceTraversal = true;
        mapRange({ leaf: markRemoved, post: afterMarkRemoved }, refSeq, clientId, undefined, start, end);
        if (segmentWindow.collaborating && (seq != UnassignedSequenceNumber)) {
            if (options.zamboniSegments) {
                zamboniSegments();
            }
        }
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

    function nodeUpdateLengthNewStructure(node: TextSegmentBlock, recur = false) {
        nodeUpdateTotalLength(node);
        if (segmentWindow.collaborating) {
            node.partialLengths = PartialSequenceLengths.combine(node, segmentWindow, recur);
        }
    }

    function nodeUpdateTotalLength(node: TextSegmentBlock) {
        let len = 0;
        for (let i = 0; i < node.liveSegmentCount; i++) {
            len += segmentLength(node.segments[i], UniversalSequenceNumber, segmentWindow.clientId);
        }
        node.length = len;
    }

    function nodeUpdatePathLengths(node: TextSegmentBlock, seq: number, clientId: number, newStructure = false) {
        while (node !== undefined) {
            if (newStructure) {
                nodeUpdateLengthNewStructure(node);
            }
            else {
                nodeUpdateLength(node, seq, clientId);
            }
            node = node.parent;
        }
    }

    let once = true;
    function nodeCompareUpdateLength(node: TextSegmentBlock, seq: number, clientId: number) {
        nodeUpdateTotalLength(node);
        if (segmentWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
            if (node.partialLengths !== undefined) {
                let bplStr = node.partialLengths.toString();
                node.partialLengths.update(node, seq, clientId, segmentWindow);
                let tempPartialLengths = PartialSequenceLengths.combine(node, segmentWindow);
                if (!tempPartialLengths.compare(node.partialLengths)) {
                    console.log(`partial sum update mismatch @cli ${segmentWindow.clientId} seq ${seq} clientId ${clientId}`);
                    console.log(tempPartialLengths.toString());
                    console.log("b4 " + bplStr);
                    console.log(node.partialLengths.toString());
                    if (once) {
                        console.log(nodeToString(node, "", 2));
                        once = false;
                    }
                }
            }
            else {
                node.partialLengths = PartialSequenceLengths.combine(node, segmentWindow);
            }
        }
    }

    function nodeUpdateLength(node: TextSegmentBlock, seq: number, clientId: number) {
        nodeUpdateTotalLength(node);
        if (segmentWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
            if (node.partialLengths !== undefined) {
                //nodeCompareUpdateLength(node, seq, clientId);
                if (options.incrementalUpdate) {
                    node.partialLengths.update(node, seq, clientId, segmentWindow);
                }
                else {
                    node.partialLengths = PartialSequenceLengths.combine(node, segmentWindow);
                }
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

    function nodeToString(node: TextSegmentBlock, strbuf: string, indentCount = 0) {
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
                strbuf = nodeToString(segment.child, strbuf, indentCount + 4);
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
        return strbuf;
    }

    function toString() {
        return nodeToString(root, "", 0);
    }

    let traceTraversal = false;

    function nodeMap<TAccum>(node: TextSegmentBlock, actions: TextSegmentActions, pos: number, refSeq: number,
        clientId: number, accum?: TAccum, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = nodeLength(node, refSeq, clientId);
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
                    segInfo = `cli: ${segment.clientId} seq: ${segment.seq} text: '${segment.text}'`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${segment.removedClientId} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`@tcli ${segmentWindow.clientId}: map len: ${len} start: ${start} end: ${end} ` + segInfo);
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
                        console.log(`@tcli ${segmentWindow.clientId}: map leaf action`);
                    }
                    go = actions.leaf(segment, pos, refSeq, clientId, start, end, accum);
                }
            }
            if (!go) {
                break;
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
        searchFromPos: searchFromPos,
        getLength: getLength,
        getStats: getStats,
        createMarker: createMarker,
        startCollaboration: startCollaboration,
        getSegmentWindow: getSegmentWindow,
        ackPendingSegment: ackPendingSegment,
        updateMinSeq: updateMinSeq,
        reloadFromSegments: reloadFromSegments,
        toString: toString,
        diag: diag
    }

}




