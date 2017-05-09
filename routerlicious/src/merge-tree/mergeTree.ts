// tslint:disable

import * as Base from "./base";
import * as Collections from "./collections";
import * as api from "../api";

export interface Node {
    parent: Block;
    cachedLength: number;
    isLeaf(): boolean;
}

// node with segments as children
export interface Block extends Node {
    childCount: number;
    children: Node[];
    partialLengths?: PartialSequenceLengths;
}

// TODO: make this extensible 
export enum SegmentType {
    Base,
    Text,
    Marker,
    Component,
    External
}

// internal (represents multiple leaf segments) if child is defined
export interface Segment extends Node {
    // below only for leaves
    segmentGroup?: SegmentGroup;
    seq?: number;  // if not present assumed to be previous to window min
    clientId?: number;
    removedSeq?: number;
    removedClientId?: number;
    removedClientOverlap?: number[];
    splitAt(pos: number): Segment;
    netLength(): number; // length of content or 0 if removed
    canAppend(segment: Segment): boolean;
    append(segment: Segment);
    getType(): SegmentType;
    removeRange(start: number, end: number): boolean;
}

export interface SegmentAction {
    <TAccum>(segment: Segment, pos: number, refSeq: number, clientId: number, start: number,
        end: number, accum?: TAccum): boolean;
}

interface SegmentChanges {
    next?: Segment;
    replaceCurrent?: Segment;
}

export interface BlockAction {
    <TAccum>(block: Block, pos: number, refSeq: number, clientId: number, start: number, end: number,
        accum?: TAccum): boolean;
}

export interface IncrementalSegmentAction {
    <TContext>(segment: Segment, state: IncrementalMapState<TContext>);
}

export interface IncrementalBlockAction {
    <TContext>(state: IncrementalMapState<TContext>);
}

export interface SegmentActions {
    leaf: SegmentAction;
    pre?: BlockAction;
    post?: BlockAction;
}

export interface IncrementalSegmentActions {
    leaf: IncrementalSegmentAction;
    pre?: IncrementalBlockAction;
    post?: IncrementalBlockAction;
}

export interface SearchResult {
    text: string;
    pos: number;
}

export interface MergeTreeStats {
    maxHeight: number;
    nodeCount: number;
    leafCount: number;
    removedLeafCount: number;
    liveCount: number;
    histo: number[];
    windowTime?: number;
    packTime?: number;
}

export interface SegmentGroup {
    segments: Segment[];
}

export interface OverlapClient {
    clientId: number;
    seglen: number;
}

class MergeNode implements Node {
    parent: Block;
    cachedLength: number;
    isLeaf() {
        return false;
    }
}

class MergeBlock extends MergeNode implements Block {
    constructor(public childCount: number) {
        super();
        this.children = new Array<Node>(childCount);
    }
    children: Node[];
    cachedLength: number;
}

export abstract class BaseSegment extends MergeNode implements Segment {
    constructor(public seq?: number, public clientId?: number) {
        super();
    }
    removedSeq: number;
    removedClientId: number;
    removedClientOverlap: number[];
    segmentGroup: SegmentGroup;
    isLeaf() {
        return true;
    }
    netLength() {
        if (this.removedSeq !== undefined) {
            return 0;
        }
        else {
            return this.cachedLength;
        }
    }
    canAppend(segment: Segment) {
        return false;
    }
    abstract append(segment: Segment): Segment;
    abstract getType(): SegmentType;
    abstract removeRange(start: number, end: number): boolean;
    abstract splitAt(pos: number): Segment;
}

// TODO: shift semantics; getPosition()
export class Marker extends BaseSegment {

    constructor(pos: number, seq: number, clientId: number) {
        super(seq, clientId);
        this.cachedLength = 0;
    }

    append(segment: Segment): Segment {
        throw new Error('Can not append to external segment');
    }

    getType() {
        return SegmentType.Marker;
    }
    removeRange(): boolean {
        throw new Error('Method not implemented.');
    }
    splitAt(pos: number): Segment {
        throw new Error('Method not implemented.');
    }
}

/**
 * A non-collaborative placeholder for external content.
 */
export class ExternalSegment extends BaseSegment {
    constructor(public placeholderSeq, public charLength: number, public lengthBytes: number,
        public binPosition: number) {
        super();
    }

    mergeTreeInsert(mergeTree: MergeTree, pos: number, refSeq: number, clientId: number, seq: number) {
        let segIsLocal = false;
        let checkSegmentIsLocal = (segment: Segment, pos: number, refSeq: number, clientId: number) => {
            if (segment.seq == UnassignedSequenceNumber) {
                if (MergeTree.diagInsertTie) {
                    console.log(`@cli ${glc(mergeTree, mergeTree.collabWindow.clientId)}: promoting continue due to seq ${segment.seq} text ${segment.toString()} ref ${refSeq}`);
                }
                segIsLocal = true;
            }
            // only need to look at first segment that follows finished node
            return false;
        }

        let continueFrom = (block: Block) => {
            segIsLocal = false;
            mergeTree.excursion(block, checkSegmentIsLocal);
            if (MergeTree.diagInsertTie && segIsLocal) {
                console.log(`@cli ${glc(mergeTree, mergeTree.collabWindow.clientId)}: attempting continue with ext seq ${seq} ref ${refSeq}`);
            }
            return segIsLocal;
        }

        let onLeaf = (segment: Segment, pos: number) => {
            let segmentChanges = <SegmentChanges>{};
            if (segment) {
                segmentChanges.replaceCurrent = this;
                segmentChanges.next = segment;
            }
            else {
                segmentChanges.next = this;
            }
            return segmentChanges;
        }

        mergeTree.insert(pos, refSeq, clientId, seq, this,
            (block, pos, refSeq, clientId, seq, eseg: ExternalSegment) => {
                return mergeTree.insertingWalk(block, pos, refSeq, clientId, seq, onLeaf, continueFrom);
            }
        );
    }

    append(segment: Segment): Segment {
        throw new Error('Can not append to external segment');
    }

    getType(): SegmentType {
        return SegmentType.External;
    }

    removeRange(start: number, end: number): boolean {
        throw new Error('Method not implemented.');
    }

    splitAt(pos: number): Segment {
        throw new Error('Method not implemented.');
    }
}

// TODO: segments without seq and clientid (if seq < minSeq)
export class TextSegment extends BaseSegment {
    constructor(public text: string, seq?: number, clientId?: number) {
        super(seq, clientId);
        this.cachedLength = text.length;
    }
    splitAt(pos: number) {
        if (pos > 0) {
            let remainingText = this.text.substring(pos);
            this.text = this.text.substring(0, pos);
            this.cachedLength = this.text.length;
            let leafSegment = new TextSegment(remainingText, this.seq, this.clientId);
            segmentCopy(this, leafSegment, true);
            return leafSegment;
        }
    }

    getType() {
        return SegmentType.Text;
    }

    canAppend(segment: Segment) {
        if ((!this.removedSeq) && (this.text.charAt(this.text.length - 1) != '\n')) {
            if (segment.getType() == SegmentType.Text) {
                return ((this.cachedLength <= MergeTree.TextSegmentGranularity) ||
                    (segment.cachedLength <= MergeTree.TextSegmentGranularity));
            }
        }
        return false;
    }
    toString() {
        return this.text;
    }
    append(segment: Segment) {
        if (segment.getType() === SegmentType.Text) {
            this.text += (<TextSegment>segment).text;
            this.cachedLength = this.text.length;
            return this;
        }
        else {
            throw new Error("can only append text segment");
        }
    }

    // TODO: retain removed text for undo
    // returns true if entire string removed
    removeRange(start: number, end: number) {
        let remnantString = "";
        let len = this.text.length;
        if (start > 0) {
            remnantString += this.text.substring(0, start);
        }
        if (end < len) {
            remnantString += this.text.substring(end);
        }
        this.text = remnantString;
        this.cachedLength = remnantString.length;
        return (remnantString.length == 0);
    }
}

function segmentCopy(from: Segment, to: Segment, propSegGroup = false) {
    // TODO: markers
    to.parent = from.parent;
    to.removedClientId = from.removedClientId;
    to.removedSeq = from.removedSeq;
    to.seq = from.seq;
    to.clientId = from.clientId;
    to.removedClientOverlap = from.removedClientOverlap;
    to.segmentGroup = from.segmentGroup;
    if (to.segmentGroup) {
        if (propSegGroup) {
            addToSegmentGroup(to);
        }
        else {
            segmentGroupReplace(from, to);
        }
    }
}

function incrementalGatherText(segment: Segment, state: IncrementalMapState<TextSegment>) {
    if (segment.getType() == SegmentType.Text) {
        let textSegment = <TextSegment>segment;
        if ((textSegment.removedSeq === undefined) || (textSegment.removedSeq == UnassignedSequenceNumber) || (textSegment.removedSeq > state.refSeq)) {
            if (MergeTree.traceGatherText) {
                console.log(`@cli ${this.collabWindow ? this.collabwindow.clientId : -1} gather seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
            }
            if ((state.start <= 0) && (state.end >= textSegment.text.length)) {
                state.context.text += textSegment.text;
            }
            else {
                if (state.end >= textSegment.text.length) {
                    state.context.text += textSegment.text.substring(state.start);
                }
                else {
                    state.context.text += textSegment.text.substring(state.start, state.end);
                }
            }
        }
        else {
            if (MergeTree.traceGatherText) {
                console.log(`ignore seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
            }
        }
    }
    state.op = IncrementalExecOp.Go;
}

export enum IncrementalExecOp {
    Go,
    Stop,
    Yield
}

export class IncrementalMapState<TContext> {
    op = IncrementalExecOp.Go;
    constructor(
        public block: Block,
        public actions: IncrementalSegmentActions,
        public pos: number,
        public refSeq: number,
        public clientId: number,
        public context: TContext,
        public start: number,
        public end: number,
        public childIndex = 0
    ) {
    }
}

/**
 * Sequence numbers for collaborative segments start at 1 or greater.  Every segment marked
 * with sequence number zero will be counted as part of the requested string.
 */
export const UniversalSequenceNumber = 0;
export const UnassignedSequenceNumber = -1;
export const TreeMaintainanceSequenceNumber = -2;
export const LocalClientId = -1;
export const NonCollabClient = -2;

interface PartialSequenceLength {
    seq: number;
    len: number;
    seglen: number;
    clientId?: number;
    overlapClients?: Collections.RedBlackTree<number, OverlapClient>;
}

class CollaborationWindow {
    clientId = LocalClientId;
    collaborating = false;
    // lowest-numbered segment in window; no client can reference a state before this one
    minSeq = 0;
    // highest-numbered segment in window and current 
    // reference segment for this client
    currentSeq = 0;
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

function compareStrings(a: string, b: string) {
    return a.localeCompare(b);
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

    toString(glc?: (id: number) => string) {
        let buf = "";
        for (let partial of this.partialLengths) {
            buf += `(${partial.seq},${partial.len}) `;
        }
        for (let clientId in this.clientSeqNumbers) {
            buf += `C${clientId}`;
            if (glc) {
                buf += `(${glc(+clientId)})`;
            }
            buf += ']';
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
    zamboni(segmentWindow: CollaborationWindow) {
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
    update(node: Block, seq: number, clientId: number, collabWindow: CollaborationWindow) {
        let seqSeglen = 0;
        let segCount = 0;
        // compute length for seq across children
        for (let i = 0; i < node.childCount; i++) {
            let child = node.children[i];
            if (!child.isLeaf()) {
                let childBlock = <Block>child;
                let partialLengths = childBlock.partialLengths.partialLengths;
                let seqIndex = latestLEQ(partialLengths, seq);
                if (seqIndex >= 0) {
                    let leqPartial = partialLengths[seqIndex];
                    if (leqPartial.seq == seq) {
                        seqSeglen += leqPartial.seglen;
                    }
                }
                segCount += childBlock.partialLengths.segmentCount;
            }
            else {
                let segment = <Segment>child;
                if (segment.seq == seq) {
                    seqSeglen += segment.cachedLength;
                }
                else if (segment.removedSeq == seq) {
                    seqSeglen -= segment.cachedLength;
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
            this.zamboni(collabWindow);
        }
        //   console.log('ZZZ');
        //   console.log(this.toString());
    }

    static fromLeaves(combinedPartialLengths: PartialSequenceLengths, block: Block, collabWindow: CollaborationWindow) {
        combinedPartialLengths.minLength = 0;
        combinedPartialLengths.segmentCount = block.childCount;

        function getOverlapClients(overlapClientids: number[], seglen: number) {
            let bst = new Collections.RedBlackTree<number, OverlapClient>(compareNumbers);
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

        function insertSegment(segment: Segment, removedSeq = false) {
            let seq = segment.seq;
            let segmentLen = segment.cachedLength;
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

        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (child.isLeaf()) {
                // leaf segment
                let segment = <Segment>child;
                if (seqLTE(segment.seq, collabWindow.minSeq)) {
                    combinedPartialLengths.minLength += segment.cachedLength;
                }
                else {
                    if (segment.seq != UnassignedSequenceNumber) {
                        insertSegment(segment);
                    }
                }
                if (seqLTE(segment.removedSeq, collabWindow.minSeq)) {
                    combinedPartialLengths.minLength -= segment.cachedLength;
                }
                else {
                    if ((segment.removedSeq !== undefined) &&
                        (segment.removedSeq != UnassignedSequenceNumber)) {
                        insertSegment(segment, true);
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
    static combine(block: Block, collabWindow: CollaborationWindow, recur = false) {
        let combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
        PartialSequenceLengths.fromLeaves(combinedPartialLengths, block, collabWindow);
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
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (!child.isLeaf()) {
                let childBlock = <Block>child;
                if (recur) {
                    childBlock.partialLengths = PartialSequenceLengths.combine(childBlock, collabWindow, true);
                }
                childPartials.push(childBlock.partialLengths);
            }
        }
        let childPartialsLen = childPartials.length;
        if (childPartialsLen != 0) {
            // some children are interior nodes
            if (combinedPartialLengths.partialLengths.length > 0) {
                // some children were leaves; add combined partials from these segments 
                childPartials.push(combinedPartialLengths);
                childPartialsLen++;
                combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
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
            combinedPartialLengths.zamboni(collabWindow);
        }
        //console.log(combinedPartialLengths.toString());
        return combinedPartialLengths;
    }
}

function addToSegmentGroup(segment: Segment) {
    segment.segmentGroup.segments.push(segment);
}

function removeFromSegmentGroup(segmentGroup: SegmentGroup, toRemove: Segment) {
    let index = segmentGroup.segments.indexOf(toRemove);
    if (index >= 0) {
        segmentGroup.segments.splice(index, 1);
    }
    toRemove.segmentGroup = undefined;
}

function segmentGroupReplace(currentSeg: Segment, newSegment: Segment) {
    let segmentGroup = currentSeg.segmentGroup;
    for (let i = 0, len = segmentGroup.segments.length; i < len; i++) {
        if (segmentGroup.segments[i] == currentSeg) {
            segmentGroup.segments[i] = newSegment;
            break;
        }
    }
    currentSeg.segmentGroup = undefined;
}

function clock() {
    return process.hrtime();
}

function elapsedMicroseconds(start: [number, number]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
    return duration;
}

/**
 * Used for in-memory testing.  This will queue a reference string for each client message.
 */
export const useCheckQ = false;

function checkTextMatchRelative(refSeq: number, clientId: number, server: TestServer,
    msg: api.IDeltaMessage) {
    let client = server.clients[clientId];
    let serverText = server.mergeTree.getText(refSeq, clientId);
    let cliText = client.checkQ.dequeue();
    if ((cliText === undefined) || (cliText != serverText)) {
        console.log(`mismatch `);
        console.log(msg);
        //        console.log(serverText);
        //        console.log(cliText);
        console.log(server.mergeTree.toString());
        console.log(client.mergeTree.toString());
        return true;
    }
    return false;
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

export class Client {
    mergeTree: MergeTree;
    accumTime = 0;
    localTime = 0;
    localOps = 0;
    accumWindowTime = 0;
    maxWindowTime = 0;
    accumWindow = 0;
    accumOps = 0;
    verboseOps = false;
    measureOps = true;
    q: Collections.List<api.IDeltaMessage>;
    checkQ: Collections.List<string>;
    clientSequenceNumber = 1;
    clientNameToId = new Collections.RedBlackTree<string, number>(compareStrings);
    shortClientIdMap = <string[]>[];

    constructor(initText: string, public longClientId: string) {
        this.mergeTree = new MergeTree(initText);
        this.mergeTree.getLongClientId = id => this.getLongClientId(id);
        this.q = Collections.ListMakeHead<api.IDeltaMessage>();
        this.checkQ = Collections.ListMakeHead<string>();
        this.addLongClientId(longClientId);
    }

    getOrAddShortClientId(longClientId: string) {
        if (!this.clientNameToId.get(longClientId)) {
            this.addLongClientId(longClientId);
        }
        return this.getShortClientId(longClientId);
    }

    getShortClientId(longClientId: string) {
        return this.clientNameToId.get(longClientId).data;
    }

    getLongClientId(clientId: number) {
        if (clientId >= 0) {
            return this.shortClientIdMap[clientId];
        }
        else {
            return "original";
        }
    }

    addLongClientId(longClientId: string) {
        this.clientNameToId.put(longClientId, this.shortClientIdMap.length);
        this.shortClientIdMap.push(longClientId);
    }

    makeInsertMsg(text: string, pos: number, seq: number, refSeq: number, objectId: string) {
        return <api.IDeltaMessage>{
            clientId: this.longClientId,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            objectId: objectId,
            clientSequenceNumber: this.clientSequenceNumber,
            op: {
                type: api.MergeTreeMsgType.INSERT, text: text, pos1: pos
            }
        };
    }

    makeRemoveMsg(start: number, end: number, seq: number, refSeq: number, objectId: string) {
        return <api.IDeltaMessage>{
            clientId: this.longClientId,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            objectId: objectId,
            clientSequenceNumber: this.clientSequenceNumber,
            op: {
                type: api.MergeTreeMsgType.REMOVE, pos1: start, pos2: end
            }
        };
    }

    enqueueMsg(msg: api.IDeltaMessage) {
        this.q.enqueue(msg);
    }

    enqueueTestString() {
        this.checkQ.enqueue(this.getText());
    }

    coreApplyMsg(msg: api.IDeltaMessage) {
        let op = <api.IMergeTreeDeltaMsg>msg.op;
        let clid = this.getOrAddShortClientId(msg.clientId);
        switch (op.type) {
            case api.MergeTreeMsgType.INSERT:
                this.insertSegmentRemote(op.text, op.pos1, msg.sequenceNumber, msg.referenceSequenceNumber,
                    clid);
                break;
            case api.MergeTreeMsgType.REMOVE:
                this.removeSegmentRemote(op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber,
                    clid);
                break;
        }
    }

    applyMsg(msg: api.IDeltaMessage) {
        if ((msg !== undefined) && (msg.minimumSequenceNumber > this.mergeTree.getCollabWindow().minSeq)) {
            this.updateMinSeq(msg.minimumSequenceNumber);
        }
        if (msg.clientId == this.longClientId) {
            this.ackPendingSegment(msg.sequenceNumber);
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
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = UnassignedSequenceNumber;

        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq);

        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`remove local cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }

    removeSegmentRemote(start: number, end: number, seq: number, refSeq: number, clientId: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq);
        this.mergeTree.getCollabWindow().currentSeq = seq;

        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} seq ${seq} remove remote start ${start} end ${end} refseq ${refSeq} cli ${clientId}`);
        }
    }

    insertSegmentLocal(text: string, pos: number) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = UnassignedSequenceNumber;
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.insertText(pos, refSeq, clientId, seq, text);

        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local text ${text} pos ${pos} cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }

    insertSegmentRemote(text: string, pos: number, seq: number, refSeq: number, clientId: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.insertText(pos, refSeq, clientId, seq, text);
        this.mergeTree.getCollabWindow().currentSeq = seq;

        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} text ${text} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${clientId}`);
        }
    }

    ackPendingSegment(seq: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.ackPendingSegment(seq);
        this.mergeTree.getCollabWindow().currentSeq = seq;

        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ack seq # ${seq}`);
        }
    }

    updateMinSeq(minSeq: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.updateMinSeq(minSeq);

        if (this.measureOps) {
            let elapsed = elapsedMicroseconds(clockStart);
            this.accumWindowTime += elapsed;
            if (elapsed > this.maxWindowTime) {
                this.maxWindowTime = elapsed;
            }
        }
    }

    getCurrentSeq() {
        return this.mergeTree.getCollabWindow().currentSeq;
    }

    getClientId() {
        return this.mergeTree.getCollabWindow().clientId;
    }

    getText() {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getText(segmentWindow.currentSeq, segmentWindow.clientId);
    }

    getLength() {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getLength(segmentWindow.currentSeq, segmentWindow.clientId);
    }

    relText(clientId: number, refSeq: number) {
        return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ` + this.mergeTree.getText(refSeq, clientId);
    }

    startCollaboration() {
        this.mergeTree.startCollaboration(this.getShortClientId(this.longClientId));
    }
}

export interface ClientSeq {
    refSeq: number;
    clientId: string;
}

export var clientSeqComparer: Collections.Comparer<ClientSeq> = {
    min: { refSeq: -1, clientId: "" },
    compare: (a, b) => a.refSeq - b.refSeq
}

/**
 * Server for tests.  Simulates client communication by directing placing
 * messages in client queues.  
 */
export class TestServer extends Client {
    seq = 1;
    clients: Client[];
    listeners: Client[]; // listeners do not generate edits
    clientSeqNumbers: Collections.Heap<ClientSeq>;

    constructor(initText: string, clientId: string) {
        super(initText, clientId);
    }

    addClients(clients: Client[]) {
        this.clientSeqNumbers = new Collections.Heap<ClientSeq>([], clientSeqComparer);
        this.clients = clients;
        for (let client of clients) {
            this.clientSeqNumbers.add({ refSeq: client.getCurrentSeq(), clientId: client.longClientId });
        }
    }

    addListeners(listeners: Client[]) {
        this.listeners = listeners;
    }

    applyMsg(msg: api.IDeltaMessage) {
        this.coreApplyMsg(msg);
        if (useCheckQ) {
            let clid = this.getShortClientId(msg.clientId);
            return checkTextMatchRelative(msg.referenceSequenceNumber, clid, this, msg);
        }
        else {
            return false;
        }
    }

    applyMessages(msgCount: number) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                msg.sequenceNumber = this.seq++;
                if (this.applyMsg(msg)) {
                    return true;
                }
                if (this.clients) {
                    let minCli = this.clientSeqNumbers.peek();
                    if (minCli && (minCli.clientId == msg.clientId) &&
                        (minCli.refSeq < msg.referenceSequenceNumber)) {
                        let cliSeq = this.clientSeqNumbers.get();
                        let oldSeq = cliSeq.refSeq;
                        cliSeq.refSeq = msg.referenceSequenceNumber;
                        this.clientSeqNumbers.add(cliSeq);
                        minCli = this.clientSeqNumbers.peek();
                        if (minCli.refSeq > oldSeq) {
                            msg.minimumSequenceNumber = minCli.refSeq;
                            this.updateMinSeq(minCli.refSeq);
                        }
                    }
                    for (let client of this.clients) {
                        client.enqueueMsg(msg);
                    }
                    if (this.listeners) {
                        for (let listener of this.listeners) {
                            listener.enqueueMsg(msg);
                        }
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
    segment?: Segment;
    maxSeq: number;
}

var LRUSegmentComparer: Collections.Comparer<LRUSegment> = {
    min: { maxSeq: -2 },
    compare: (a, b) => a.maxSeq - b.maxSeq
}

function glc(mergeTree: MergeTree, id: number) {
    if (mergeTree.getLongClientId) {
        return mergeTree.getLongClientId(id);
    }
    else {
        return id.toString();
    }
}

// represents a sequence of text segments
export class MergeTree {
    // must be an even number   
    static MaxNodesInBlock = 8;
    static TextSegmentGranularity = 128;
    static zamboniSegmentsMaxCount = 2;
    static options = {
        incrementalUpdate: true,
        zamboniSegments: true,
        measureWindowTime: true,
    };
    static searchChunkSize = 256;
    static traceGatherText = false;
    static diagInsertTie = false;
    static skipLeftShift = true;
    static diagOverlappingRemove = false;
    static traceTraversal = false;
    static traceIncrTraversal = false;

    static theUnfinishedNode = <Block>{ childCount: -1 };

    windowTime = 0;
    packTime = 0;

    root: Block;
    collabWindow = new CollaborationWindow();
    pendingSegments: Collections.List<SegmentGroup>;
    segmentsToScour: Collections.Heap<LRUSegment>;
    // for diagnostics
    getLongClientId: (id: number) => string;

    constructor(public text: string) {
        this.root = this.initialTextNode(this.text);
    }

    makeBlock(childCount: number) {
        return new MergeBlock(childCount);
    }

    initialTextNode(text: string) {
        let block = this.makeBlock(1);
        block.children[0] = new TextSegment(text, UniversalSequenceNumber, LocalClientId);
        block.children[0].parent = block;
        block.cachedLength = text.length;
        return block;
    }

    addNode(block: Block, node: Node) {
        block.children[block.childCount++] = node;
        node.parent = block;
    }

    reloadFromSegments(segments: Segment[]) {
        let segCap = MergeTree.MaxNodesInBlock - 1;
        const measureReloadTime = false;
        let buildMergeTree: (nodes: Node[]) => Block = (nodes: Segment[]) => {
            const nodeCount = Math.ceil(nodes.length / segCap);
            const blocks: Block[] = [];
            let nodeIndex = 0;
            for (let i = 0; i < nodeCount; i++) {
                let len = 0;
                blocks[i] = new MergeBlock(0);
                for (let j = 0; j < segCap; j++) {
                    if (nodeIndex < nodes.length) {
                        this.addNode(blocks[i], nodes[nodeIndex]);
                        len += nodes[nodeIndex].cachedLength;
                    } else {
                        break;
                    }
                    nodeIndex++;
                }
                blocks[i].cachedLength = len;
            }
            if (blocks.length == 1) {
                return blocks[0];
            }
            else {
                return buildMergeTree(blocks);
            }
        }
        let clockStart;
        if (measureReloadTime) {
            clockStart = clock();
        }
        this.root = this.makeBlock(1);
        let mergeTree = buildMergeTree(segments);
        mergeTree.parent = this.root;
        this.root.children[0] = mergeTree;
        this.root.cachedLength = mergeTree.cachedLength;
        if (measureReloadTime) {
            console.log(`reload time ${elapsedMicroseconds(clockStart)}`);
        }
    }

    // for now assume min starts at zero
    startCollaboration(localClientId: number) {
        this.collabWindow.clientId = localClientId;
        this.collabWindow.minSeq = 0;
        this.collabWindow.collaborating = true;
        this.collabWindow.currentSeq = 0;
        this.segmentsToScour = new Collections.Heap<LRUSegment>([], LRUSegmentComparer);
        this.pendingSegments = Collections.ListMakeHead<SegmentGroup>();
        let measureFullCollab = true;
        let clockStart;
        if (measureFullCollab) {
            clockStart = clock();
        }
        this.nodeUpdateLengthNewStructure(this.root, true);
        if (measureFullCollab) {
            console.log(`update partial lengths at start ${elapsedMicroseconds(clockStart)}`);
        }
    }

    addToLRUSet(segment: Segment, seq: number) {
        this.segmentsToScour.add({ segment: segment, maxSeq: seq });
    }

    underflow(node: Block) {
        return node.childCount < (MergeTree.MaxNodesInBlock / 2);
    }

    scourNode(node: Block, holdNodes: Node[]) {
        let prevSegment: Segment;
        for (let k = 0; k < node.childCount; k++) {
            let childNode = node.children[k];
            if (childNode.isLeaf()) {
                let segment = <Segment>childNode;
                if ((segment.removedSeq != undefined) && (segment.removedSeq != UnassignedSequenceNumber)) {
                    if (segment.removedSeq > this.collabWindow.minSeq) {
                        holdNodes.push(segment);
                    }
                    else {
                        // console.log(`removed rseq ${segment.removedSeq}`);
                        segment.parent = undefined;
                    }
                    prevSegment = undefined;
                }
                else {
                    if ((segment.seq <= this.collabWindow.minSeq) &&
                        (!segment.segmentGroup) && (segment.seq != UnassignedSequenceNumber)) {
                        if (prevSegment && prevSegment.canAppend(segment)) {
                            prevSegment.append(segment);
                            segment.parent = undefined;
                        }
                        else {
                            holdNodes.push(segment);
                            prevSegment = segment;
                        }
                    }
                    else {
                        holdNodes.push(segment);
                        prevSegment = undefined;
                    }
                }
            }
            else {
                holdNodes.push(childNode);
                prevSegment = undefined;
            }
        }
    }

    // interior node with all node children
    pack(block: Block) {
        let parent = block.parent;
        let children = parent.children;
        let childIndex: number;
        let childBlock: Block;
        let holdNodes = <Node[]>[];
        for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
            // debug assert not isLeaf()
            childBlock = <Block>children[childIndex];
            this.scourNode(childBlock, holdNodes);
        }
        let totalNodeCount = holdNodes.length;
        let halfCount = MergeTree.MaxNodesInBlock / 2;
        let childCount = Math.min(MergeTree.MaxNodesInBlock - 1, Math.floor(totalNodeCount / halfCount));
        if (childCount < 1) {
            childCount = 1;
        }
        let baseCount = Math.floor(totalNodeCount / childCount);
        let extraCount = totalNodeCount % childCount;
        let packedBlocks = <Block[]>new Array(MergeTree.MaxNodesInBlock);
        let readCount = 0;
        for (let nodeIndex = 0; nodeIndex < childCount; nodeIndex++) {
            let nodeCount = baseCount;
            if (extraCount > 0) {
                nodeCount++;
                extraCount--;
            }
            let packedBlock = this.makeBlock(nodeCount);
            for (let packedNodeIndex = 0; packedNodeIndex < nodeCount; packedNodeIndex++) {
                let nodeToPack = holdNodes[readCount++];
                packedBlock.children[packedNodeIndex] = nodeToPack;
                nodeToPack.parent = packedBlock;
            }
            packedBlock.parent = parent;
            packedBlocks[nodeIndex] = packedBlock;
            this.nodeUpdateLengthNewStructure(packedBlock);
        }
        if (readCount != totalNodeCount) {
            console.log(`total count ${totalNodeCount} readCount ${readCount}`);
        }
        parent.children = packedBlocks;
        parent.childCount = childCount;
        if (this.underflow(parent) && (parent.parent)) {
            this.pack(parent);
        }
        else {
            this.nodeUpdatePathLengths(parent, UnassignedSequenceNumber, -1, true);
        }
    }

    zamboniSegments() {
        //console.log(`scour line ${segmentsToScour.count()}`);
        let clockStart;
        if (MergeTree.options.measureWindowTime) {
            clockStart = clock();
        }

        let segmentToScour = this.segmentsToScour.peek();
        if (segmentToScour && (segmentToScour.maxSeq <= this.collabWindow.minSeq)) {
            for (let i = 0; i < MergeTree.zamboniSegmentsMaxCount; i++) {
                segmentToScour = this.segmentsToScour.get();
                if (segmentToScour && segmentToScour.segment.parent &&
                    (segmentToScour.maxSeq <= this.collabWindow.minSeq)) {
                    let block = segmentToScour.segment.parent;
                    let childrenCopy = <Node[]>[];
                    //                console.log(`scouring from ${segmentToScour.segment.seq}`);
                    this.scourNode(block, childrenCopy);
                    let newChildCount = childrenCopy.length;

                    if (newChildCount < block.childCount) {
                        block.childCount = newChildCount;
                        block.children = childrenCopy;

                        if (this.underflow(block) && block.parent) {
                            //nodeUpdatePathLengths(node, UnassignedSequenceNumber, -1, true);
                            let packClockStart;
                            if (MergeTree.options.measureWindowTime) {
                                packClockStart = clock();
                            }
                            this.pack(block);

                            if (MergeTree.options.measureWindowTime) {
                                this.packTime += elapsedMicroseconds(packClockStart);
                            }
                        }
                        else {
                            this.nodeUpdatePathLengths(block, UnassignedSequenceNumber, -1, true);
                        }

                    }
                }
                else {
                    break;
                }
            }
        }

        if (MergeTree.options.measureWindowTime) {
            this.windowTime += elapsedMicroseconds(clockStart);
        }
    }

    getCollabWindow() {
        return this.collabWindow;
    }

    getStats() {
        let nodeGetStats = (block: Block) => {
            let stats = { maxHeight: 0, nodeCount: 0, leafCount: 0, removedLeafCount: 0, liveCount: 0, histo: [] };
            for (let k = 0; k < MergeTree.MaxNodesInBlock; k++) {
                stats.histo[k] = 0;
            }
            for (let i = 0; i < block.childCount; i++) {
                let child = block.children[i];
                let height = 1;
                if (!child.isLeaf()) {
                    let childStats = nodeGetStats(<Block>child);
                    height = 1 + childStats.maxHeight;
                    stats.nodeCount += childStats.nodeCount;
                    stats.leafCount += childStats.leafCount;
                    stats.removedLeafCount += childStats.removedLeafCount;
                    stats.liveCount += childStats.liveCount;
                    for (let i = 0; i < MergeTree.MaxNodesInBlock; i++) {
                        stats.histo[i] += childStats.histo[i];
                    }
                }
                else {
                    stats.leafCount++;
                    let segment = <Segment>child;
                    if (segment.removedSeq !== undefined) {
                        stats.removedLeafCount++;
                    }
                }
                if (height > stats.maxHeight) {
                    stats.maxHeight = height;
                }
            }
            stats.histo[block.childCount]++;
            stats.nodeCount++;
            stats.liveCount += block.childCount;
            return stats;
        }
        let rootStats = <MergeTreeStats>nodeGetStats(this.root);
        if (MergeTree.options.measureWindowTime) {
            rootStats.windowTime = this.windowTime;
            rootStats.packTime = this.packTime;
        }
        return rootStats;
    }

    getLength(refSeq: number, clientId: number) {
        return this.blockLength(this.root, refSeq, clientId);
    }

    getOffset(node: Node, refSeq: number, clientId: number) {
        let totalOffset = 0;
        let parent = node.parent;
        let prevParent: Block;
        while (parent) {
            let children = parent.children;
            for (let childIndex = 0; childIndex < parent.childCount; childIndex++) {
                let child = children[childIndex];
                if ((prevParent && (child == prevParent)) || (child == node)) {
                    break;
                }
                totalOffset += this.nodeLength(child, refSeq, clientId);
            }
            prevParent = parent;
            parent = parent.parent;
        }
        return totalOffset;
    }

    searchFromPos(pos: number, target: RegExp) {
        let start = pos;
        let end = pos + MergeTree.searchChunkSize;
        let chunk = "";
        let found = false;
        while (!found) {
            if (end > this.root.cachedLength) {
                end = this.root.cachedLength;
            }
            chunk += this.getText(UniversalSequenceNumber, this.collabWindow.clientId, start, end);
            let result = chunk.match(target);
            if (result !== null) {
                return { text: result[0], pos: result.index };
            }
            start += MergeTree.searchChunkSize;
            if (start >= this.root.cachedLength) {
                break;
            }
            end += MergeTree.searchChunkSize;
        }
    }

    gatherText = (segment: Segment, pos: number, refSeq: number, clientId: number, start: number,
        end: number, accumText: TextSegment) => {
        if (segment.getType() == SegmentType.Text) {
            let textSegment = <TextSegment>segment;
            if ((textSegment.removedSeq === undefined) || (textSegment.removedSeq == UnassignedSequenceNumber) || (textSegment.removedSeq > refSeq)) {
                if (MergeTree.traceGatherText) {
                    console.log(`@cli ${this.getLongClientId(this.collabWindow.clientId)} gather seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
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
                if (MergeTree.traceGatherText) {
                    console.log(`ignore seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
                }
            }
        }
        return true;
    }

    incrementalGetText(refSeq: number, clientId: number, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let context = new TextSegment("");
        let stack = new Collections.Stack<IncrementalMapState<TextSegment>>();
        let initialState = new IncrementalMapState(this.root, { leaf: incrementalGatherText },
            0, refSeq, clientId, context, start, end, 0);
        stack.push(initialState);

        while (!stack.empty()) {
            this.incrementalBlockMap(stack);
        }
        return context.text;
    }

    getText(refSeq: number, clientId: number, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let accum = new TextSegment("");
        if (MergeTree.traceGatherText) {
            console.log(`get text on cli ${glc(this, this.collabWindow.clientId)} ref cli ${glc(this, clientId)} refSeq ${refSeq}`);
        }
        this.mapRange({ leaf: this.gatherText }, refSeq, clientId, accum, start, end);
        return accum.text;
    }

    getContainingSegment(pos: number, refSeq: number, clientId: number) {
        if (pos !== undefined) {
            return this.search(this.root, refSeq, clientId, pos);
        }
        // TODO: error on undefined
    }

    blockLength(node: Block, refSeq: number, clientId: number) {
        if ((this.collabWindow.collaborating) && (clientId != this.collabWindow.clientId)) {
            return node.partialLengths.getPartialLength(refSeq, clientId);
        }
        else {
            return node.cachedLength;
        }
    }

    nodeLength(node: Node, refSeq: number, clientId: number) {
        if ((!this.collabWindow.collaborating) || (this.collabWindow.clientId == clientId)) {
            // local client sees all segments, even when collaborating
            if (!node.isLeaf()) {
                return node.cachedLength;
            }
            else {
                return (<Segment>node).netLength();
            }
        }
        else {
            // sequence number within window 
            if (!node.isLeaf()) {
                return (<Block>node).partialLengths.getPartialLength(refSeq, clientId);
            }
            else {
                let segment = <Segment>node;
                if ((segment.clientId == clientId) || ((segment.seq != UnassignedSequenceNumber) && (segment.seq <= refSeq))) {
                    // segment happened by reference sequence number or segment from requesting client
                    if ((segment.removedSeq !== undefined) &&
                        ((segment.removedClientId == clientId) ||
                            (segment.removedClientOverlap && (segment.removedClientOverlap.indexOf(clientId) >= 0)) ||
                            ((segment.removedSeq != UnassignedSequenceNumber) && (segment.removedSeq <= refSeq)))) {
                        return 0;
                    }
                    else {
                        return segment.cachedLength;
                    }
                }
                else {
                    // segment invisible to client at reference sequence number
                    return 0;
                }
            }
        }
    }

    updateMinSeq(minSeq: number) {
        this.collabWindow.minSeq = minSeq;
        if (MergeTree.options.zamboniSegments) {
            this.zamboniSegments();
        }
    }

    search<TAccum>(node: Block, pos: number, refSeq: number, clientId: number, action?: SegmentAction, accum?: TAccum): Segment {
        let children = node.children;
        let start = pos;
        for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (start < len) {
                // found entry containing pos
                if (!child.isLeaf()) {
                    return this.search(<Block>child, pos, refSeq, clientId, action);
                }
                else {
                    if (action) {
                        action(<Segment>child, pos, refSeq, clientId, start, -1, accum);
                    }
                    return <Segment>child;
                }
            }
            else {
                start -= len;
            }
        }
    }

    updateRoot(splitNode: Block, refSeq: number, clientId: number, seq: number) {
        if (splitNode !== undefined) {
            let newRoot = this.makeBlock(2);
            splitNode.parent = newRoot;
            this.root.parent = newRoot;
            newRoot.children[0] = this.root;
            newRoot.children[1] = splitNode;
            this.root = newRoot;
            this.nodeUpdateLengthNewStructure(this.root);
        }
    }

    /**
     * Assign sequence number to existing segment; update partial lengths to reflect the change
     * @param seq sequence number given by server to pending segment
     */
    ackPendingSegment(seq: number) {
        let pendingSegmentGroup = this.pendingSegments.dequeue();
        let nodesToUpdate = <Block[]>[];
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
                            if (MergeTree.diagOverlappingRemove) {
                                console.log(`grump @seq ${seq} cli ${glc(this, this.collabWindow.clientId)} from ${pendingSegment.removedSeq} text ${pendingSegment.toString()}`);
                            }
                        }
                        else {
                            pendingSegment.removedSeq = seq;
                        }
                    }
                }
                pendingSegment.segmentGroup = undefined;
                clientId = this.collabWindow.clientId;
                if (nodesToUpdate.indexOf(pendingSegment.parent) < 0) {
                    nodesToUpdate.push(pendingSegment.parent);
                }
            });
            for (let node of nodesToUpdate) {
                this.nodeUpdatePathLengths(node, seq, clientId, overwrite);
                //nodeUpdatePathLengths(node, seq, clientId, true);
            }
        }
    }

    addToPendingList(segment: Segment, segmentGroup?: SegmentGroup) {
        if (segmentGroup === undefined) {
            segmentGroup = <SegmentGroup>{ segments: [] };
            this.pendingSegments.enqueue(segmentGroup);
        }
        // TODO: share this group with UNDO
        segment.segmentGroup = segmentGroup;
        addToSegmentGroup(segment);
        return segmentGroup;
    }

    // assumes not collaborating for now
    appendTextSegment(text: string) {
        let pos = this.root.cachedLength;
        this.insertText(pos, UniversalSequenceNumber, LocalClientId, UniversalSequenceNumber, text);
    }

    insert<T>(pos: number, refSeq: number, clientId: number, seq: number, segData: T,
        traverse: (block: Block, pos: number, refSeq: number, clientId: number, seq: number, segData: T) => Block) {
        this.ensureIntervalBoundary(pos, refSeq, clientId);
        //traceTraversal = true;
        let splitNode = traverse(this.root, pos, refSeq, clientId, seq, segData);
        //traceTraversal = false;
        this.updateRoot(splitNode, refSeq, clientId, seq);
    }

    insertText(pos: number, refSeq: number, clientId: number, seq: number, text: string) {
        this.insert(pos, refSeq, clientId, seq, text, (block, pos, refSeq, clientId, seq, text) =>
            this.nodeInsertText(this.root, pos, refSeq, clientId, seq, text));
        if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
            (seq != UnassignedSequenceNumber)) {
            this.zamboniSegments();
        }
    }

    nodeInsertText(node: Block, pos: number, refSeq: number, clientId: number, seq: number, text: string) {
        let segIsLocal = false;
        let checkSegmentIsLocal = (segment: Segment, pos: number, refSeq: number, clientId: number) => {
            if (segment.seq == UnassignedSequenceNumber) {
                if (MergeTree.diagInsertTie) {
                    console.log(`@cli ${glc(this, this.collabWindow.clientId)}: promoting continue due to seq ${segment.seq} text ${segment.toString()} ref ${refSeq}`);
                }
                segIsLocal = true;
            }
            // only need to look at first segment that follows finished node
            return false;
        }

        let continueFrom = (node: Block) => {
            segIsLocal = false;
            this.excursion(node, checkSegmentIsLocal);
            if (MergeTree.diagInsertTie && segIsLocal) {
                console.log(`@cli ${glc(this, this.collabWindow.clientId)}: attempting continue with seq ${seq} text ${text} ref ${refSeq}`);
            }
            return segIsLocal;
        }

        let onLeaf = (segment: Segment, pos: number) => {
            let saveIfLocal = (locSegment: Segment) => {
                // save segment so can assign sequence number when acked by server
                if (this.collabWindow.collaborating) {
                    if ((locSegment.seq == UnassignedSequenceNumber) &&
                        (clientId == this.collabWindow.clientId)) {
                        this.addToPendingList(locSegment);
                    }
                    else if ((locSegment.seq >= this.collabWindow.minSeq) &&
                        MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(locSegment, locSegment.seq);
                    }
                }
            }
            let segmentChanges = <SegmentChanges>{};
            let newSegment = new TextSegment(text, seq, clientId);
            if (segment) {
                // insert before segment
                segmentChanges.replaceCurrent = newSegment;
                segmentChanges.next = segment;
            }
            else {
                segmentChanges.next = newSegment;
            }
            saveIfLocal(newSegment);
            return segmentChanges;
        }
        return this.insertingWalk(node, pos, refSeq, clientId, seq, onLeaf, continueFrom);
    }

    splitLeafSegment = (segment: Segment, pos: number) => {
        let segmentChanges = <SegmentChanges>{};
        if (pos > 0) {
            segmentChanges.next = segment.splitAt(pos);
        }
        return segmentChanges;
    }

    ensureIntervalBoundary(pos: number, refSeq: number, clientId: number) {
        let splitNode = this.insertingWalk(this.root, pos, refSeq, clientId, TreeMaintainanceSequenceNumber, this.splitLeafSegment);
        this.updateRoot(splitNode, refSeq, clientId, TreeMaintainanceSequenceNumber);
    }

    // assume caled only when pos == len
    breakTie(pos: number, len: number, seq: number, node: Node, refSeq: number, clientId: number) {
        if (node.isLeaf()) {
            let segment = <Segment>node;
            if (pos == 0) {
                return segment.seq != UnassignedSequenceNumber;
            }
            else {
                return false;
            }
        }
        else {
            return true;
        }
    }

    // visit segments starting from node's right siblings, then up to node's parent
    excursion(node: Block, leafAction: SegmentAction) {
        let actions = { leaf: leafAction };
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            let children = parent.children;
            let childIndex: number;
            let node: Node;
            let matchedStart = false;
            for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
                node = children[childIndex];
                if (matchedStart) {
                    if (!node.isLeaf()) {
                        let childBlock = <Block>node;
                        go = this.nodeMap(childBlock, actions, 0, UniversalSequenceNumber, this.collabWindow.clientId, undefined);
                    }
                    else {
                        go = leafAction(<Segment>node, 0, UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
                    }
                    if (!go) {
                        return;
                    }
                }
                else {
                    let childBlock = <Block>node;
                    matchedStart = (startNode === childBlock);
                }
            }
            startNode = parent;
            parent = parent.parent;
        }
    }

    insertingWalk(block: Block, pos: number, refSeq: number, clientId: number, seq: number,
        leafAction: (segment: Segment, pos: number) => SegmentChanges,
        continuePredicate?: (continueFromBlock: Block) => boolean) {
        let children = block.children;
        let childIndex: number;
        let child: Node;
        let newNode: Node;
        let found = false;
        for (childIndex = 0; childIndex < block.childCount; childIndex++) {
            child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (MergeTree.traceTraversal) {
                let segInfo: string;
                if ((!child.isLeaf()) && this.collabWindow.collaborating) {
                    segInfo = `minLength: ${(<Block>child).partialLengths.minLength}`;
                }
                else {
                    let segment = <Segment>child;
                    segInfo = `cli: ${glc(this, segment.clientId)} seq: ${segment.seq} text: ${segment.toString()}`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${glc(this, segment.removedClientId)} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`@tcli: ${glc(this, this.collabWindow.clientId)} len: ${len} pos: ${pos} ` + segInfo);
            }

            if ((pos < len) || ((pos == len) && this.breakTie(pos, len, seq, child, refSeq, clientId))) {
                // found entry containing pos
                found = true;
                if (!child.isLeaf()) {
                    let childBlock = <Block>child;
                    //internal node
                    let splitNode = this.insertingWalk(childBlock, pos, refSeq, clientId, seq, leafAction,
                        continuePredicate);
                    if (splitNode === undefined) {
                        this.blockUpdateLength(block, seq, clientId);
                        return undefined;
                    }
                    else if (splitNode == MergeTree.theUnfinishedNode) {
                        if (MergeTree.traceTraversal) {
                            console.log(`@cli ${glc(this, this.collabWindow.clientId)} unfinished bus pos ${pos} len ${len}`);
                        }
                        pos -= len; // act as if shifted segment
                        continue;
                    }
                    else {
                        newNode = splitNode;
                        childIndex++; // insert after
                    }
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli: ${glc(this, this.collabWindow.clientId)}: leaf action`);
                    }

                    let segmentChanges = leafAction(<Segment>child, pos);
                    if (segmentChanges.replaceCurrent) {
                        block.children[childIndex] = segmentChanges.replaceCurrent;
                        segmentChanges.replaceCurrent.parent = block;
                    }
                    if (segmentChanges.next) {
                        newNode = segmentChanges.next;
                        childIndex++; // insert after
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
        if (MergeTree.traceTraversal) {
            if ((!found) && (pos > 0)) {
                console.log(`inserting walk fell through pos ${pos} len: ${this.blockLength(this.root, refSeq, clientId)}`);
            }
        }
        if (!newNode) {
            if (pos == 0) {
                if ((seq != UnassignedSequenceNumber) && continuePredicate && continuePredicate(block)) {
                    return MergeTree.theUnfinishedNode;
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli: ${glc(this, this.collabWindow.clientId)}: leaf action pos 0`);
                    }
                    let segmentChanges = leafAction(undefined, pos);
                    newNode = segmentChanges.next;
                    // assert segmentChanges.replaceCurrent === undefined
                }
            }
        }
        if (newNode) {
            for (let i = block.childCount; i > childIndex; i--) {
                block.children[i] = block.children[i - 1];
            }
            block.children[childIndex] = newNode;
            newNode.parent = block;
            block.childCount++;
            if (block.childCount < MergeTree.MaxNodesInBlock) {
                this.blockUpdateLength(block, seq, clientId);
                return undefined;
            }
            else {
                return this.split(block);
            }
        }
        else {
            return undefined;
        }
    }

    split(node: Block) {
        let halfCount = MergeTree.MaxNodesInBlock / 2;
        let newNode = this.makeBlock(halfCount);
        node.childCount = halfCount;
        for (let i = 0; i < halfCount; i++) {
            newNode.children[i] = node.children[halfCount + i];
            newNode.children[i].parent = newNode;
        }
        this.nodeUpdateLengthNewStructure(node);
        this.nodeUpdateLengthNewStructure(newNode);
        return newNode;
    }

    addOverlappingClient(textSegment: Segment, clientId: number) {
        if (!textSegment.removedClientOverlap) {
            textSegment.removedClientOverlap = <number[]>[];
        }
        if (MergeTree.diagOverlappingRemove) {
            console.log(`added cli ${glc(this, clientId)} to rseq: ${textSegment.removedSeq} text ${textSegment.toString()}`);
        }
        textSegment.removedClientOverlap.push(clientId);
    }

    markRangeRemoved(start: number, end: number, refSeq: number, clientId: number, seq: number) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        let segmentGroup: SegmentGroup;
        let overwrite = false;
        let markRemoved = (segment: Segment, pos: number, start: number, end: number) => {
            if (segment.removedSeq != undefined) {
                if (MergeTree.diagOverlappingRemove) {
                    console.log(`yump @seq ${seq} cli ${glc(this, this.collabWindow.clientId)}: overlaps deleted segment ${segment.removedSeq} text ${segment.toString()}`);
                }
                overwrite = true;
                if (segment.removedSeq == UnassignedSequenceNumber) {
                    // replace because comes later
                    segment.removedClientId = clientId;
                    segment.removedSeq = seq;
                    removeFromSegmentGroup(segment.segmentGroup, segment);
                }
                else {
                    // do not replace earlier sequence number for remove
                    this.addOverlappingClient(segment, clientId);
                }
            }
            else {
                segment.removedClientId = clientId;
                segment.removedSeq = seq;
            }
            // save segment so can assign removed sequence number when acked by server
            if (this.collabWindow.collaborating) {
                if ((segment.removedSeq == UnassignedSequenceNumber) && (clientId == this.collabWindow.clientId)) {
                    segmentGroup = this.addToPendingList(segment, segmentGroup);
                }
                else {
                    if (MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(segment, seq);
                    }
                }
                //console.log(`saved local removed seg with text: ${textSegment.text}`);
            }
            return true;
        }
        let afterMarkRemoved = (node: Block, pos: number, start: number, end: number) => {
            if (overwrite) {
                this.nodeUpdateLengthNewStructure(node);
            }
            else {
                this.blockUpdateLength(node, seq, clientId);
            }
            return true;
        }
        //traceTraversal = true;
        this.mapRange({ leaf: markRemoved, post: afterMarkRemoved }, refSeq, clientId, undefined, start, end);
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber)) {
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
        MergeTree.traceTraversal = false;
    }

    removeRange(start: number, end: number, refSeq: number, clientId: number) {
        this.nodeRemoveRange(this.root, start, end, refSeq, clientId);
    }

    nodeRemoveRange(block: Block, start: number, end: number, refSeq: number, clientId: number) {
        let children = block.children;
        let startIndex: number;
        if (start < 0) {
            startIndex = -1;
        }
        let endIndex = block.childCount;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if ((start >= 0) && (start < len)) {
                startIndex = childIndex;
                if (!child.isLeaf()) {
                    this.nodeRemoveRange(<Block>child, start, end, refSeq, clientId);
                }
                else {
                    let segment = <Segment>child;
                    if (segment.removeRange(start, end)) {
                        startIndex--;
                    }
                }
            }
            // REVIEW: run this clause even if above clause runs
            if (end < len) {
                endIndex = childIndex;
                if (end > 0) {
                    if (endIndex > startIndex) {
                        if (!child.isLeaf()) {
                            this.nodeRemoveRange(<Block>child, start, end, refSeq, clientId);
                        }
                        else {
                            let segment = <Segment>child;
                            if (segment.removeRange(0, end)) {
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
            let copyCount = block.childCount - copyStart;
            for (let j = 0; j < copyCount; j++) {
                children[deleteStart + j] = children[copyStart + j];
            }
            block.childCount -= deleteCount;
        }
        this.nodeUpdateLengthNewStructure(block);
    }

    nodeUpdateLengthNewStructure(node: Block, recur = false) {
        this.nodeUpdateTotalLength(node);
        if (this.collabWindow.collaborating) {
            node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow, recur);
        }
    }

    nodeUpdateTotalLength(node: Block) {
        let len = 0;
        for (let i = 0; i < node.childCount; i++) {
            len += this.nodeLength(node.children[i], UniversalSequenceNumber, this.collabWindow.clientId);
        }
        node.cachedLength = len;
    }

    nodeUpdatePathLengths(node: Block, seq: number, clientId: number, newStructure = false) {
        while (node !== undefined) {
            if (newStructure) {
                this.nodeUpdateLengthNewStructure(node);
            }
            else {
                this.blockUpdateLength(node, seq, clientId);
            }
            node = node.parent;
        }
    }

    nodeCompareUpdateLength(node: Block, seq: number, clientId: number) {
        this.nodeUpdateTotalLength(node);
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
            if (node.partialLengths !== undefined) {
                let bplStr = node.partialLengths.toString();
                node.partialLengths.update(node, seq, clientId, this.collabWindow);
                let tempPartialLengths = PartialSequenceLengths.combine(node, this.collabWindow);
                if (!tempPartialLengths.compare(node.partialLengths)) {
                    console.log(`partial sum update mismatch @cli ${glc(this, this.collabWindow.clientId)} seq ${seq} clientId ${glc(this, clientId)}`);
                    console.log(tempPartialLengths.toString());
                    console.log("b4 " + bplStr);
                    console.log(node.partialLengths.toString());
                }
            }
            else {
                node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow);
            }
        }
    }

    blockUpdateLength(node: Block, seq: number, clientId: number) {
        this.nodeUpdateTotalLength(node);
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
            if (node.partialLengths !== undefined) {
                //nodeCompareUpdateLength(node, seq, clientId);
                if (MergeTree.options.incrementalUpdate) {
                    node.partialLengths.update(node, seq, clientId, this.collabWindow);
                }
                else {
                    node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow);
                }
            }
            else {
                node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow);
            }
        }
    }

    map<TAccum>(actions: SegmentActions, refSeq: number, clientId: number, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        this.nodeMap(this.root, actions, 0, refSeq, clientId, accum);
    }

    mapRange<TAccum>(actions: SegmentActions, refSeq: number, clientId: number, accum?: TAccum, start?: number, end?: number) {
        this.nodeMap(this.root, actions, 0, refSeq, clientId, accum, start, end);
    }

    nodeToString(node: Block, strbuf: string, indentCount = 0) {
        strbuf += indent(indentCount);
        strbuf += `Node (len ${node.cachedLength}) p len (${node.parent ? node.parent.cachedLength : 0}) with ${node.childCount} live segments:\n`;
        if (this.collabWindow.collaborating) {
            strbuf += indent(indentCount);
            strbuf += node.partialLengths.toString((id) => glc(this, id)) + '\n';
        }
        let children = node.children;
        for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
            let child = children[childIndex];
            if (!child.isLeaf()) {
                strbuf = this.nodeToString(<Block>child, strbuf, indentCount + 4);
            }
            else {
                let segment = <Segment>child;
                strbuf += indent(indentCount + 4);
                strbuf += `cli: ${glc(this, segment.clientId)} seq: ${segment.seq}`;
                if (segment.removedSeq !== undefined) {
                    strbuf += ` rcli: ${glc(this, segment.removedClientId)} rseq: ${segment.removedSeq}`;
                }
                strbuf += "\n";
                strbuf += indent(indentCount + 4);
                strbuf += segment.toString();
                strbuf += "\n";
            }
        }
        return strbuf;
    }

    toString() {
        return this.nodeToString(this.root, "", 0);
    }

    incrementalBlockMap<TContext>(stateStack: Collections.Stack<IncrementalMapState<TContext>>) {
        while (!stateStack.empty()) {
            let state = stateStack.top();
            if (state.op != IncrementalExecOp.Go) {
                return;
            }
            if (state.childIndex == 0) {
                if (state.start === undefined) {
                    state.start = 0;
                }
                if (state.end === undefined) {
                    state.end = this.blockLength(state.block, state.refSeq, state.clientId);
                }

                if (state.actions.pre) {
                    state.actions.pre(state);
                }
            }
            if ((state.op == IncrementalExecOp.Go) && (state.childIndex < state.block.childCount)) {
                let child = state.block.children[state.childIndex];
                let len = this.nodeLength(child, state.refSeq, state.clientId);
                if (MergeTree.traceIncrTraversal) {
                    if (child.isLeaf()) {
                        console.log(`considering (r ${state.refSeq} c ${glc(this, state.clientId)}) seg with text ${(<TextSegment>child).text} len ${len} seq ${(<Segment>child).seq} rseq ${(<Segment>child).removedSeq} cli ${glc(this, (<Segment>child).clientId)}`);
                    }
                }
                if ((len > 0) && (state.start < len) && (state.end > 0)) {
                    if (!child.isLeaf()) {
                        let childState = new IncrementalMapState(<Block>child, state.actions, state.pos,
                            state.refSeq, state.clientId, state.context, state.start, state.end, 0);
                        stateStack.push(childState);
                    }
                    else {
                        if (MergeTree.traceIncrTraversal) {
                            console.log(`action on seg with text ${(<TextSegment>child).text}`);
                        }
                        state.actions.leaf(<Segment>child, state);
                    }
                }
                state.pos += len;
                state.start -= len;
                state.end -= len;
                state.childIndex++;
            }
            else {
                if (state.childIndex == state.block.childCount) {
                    if ((state.op == IncrementalExecOp.Go) && state.actions.post) {
                        state.actions.post(state);
                    }
                    stateStack.pop();
                }
            }
        }
    }


    nodeMap<TAccum>(node: Block, actions: SegmentActions, pos: number, refSeq: number,
        clientId: number, accum?: TAccum, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(node, refSeq, clientId);
        }
        let go = true;
        if (actions.pre) {
            go = actions.pre(node, pos, refSeq, clientId, start, end, accum);
        }
        let children = node.children;
        for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (MergeTree.traceTraversal) {
                let segInfo: string;
                if ((!child.isLeaf()) && this.collabWindow.collaborating) {
                    segInfo = `minLength: ${(<Block>child).partialLengths.minLength}`;
                }
                else {
                    let segment = <Segment>child;
                    segInfo = `cli: ${glc(this, segment.clientId)} seq: ${segment.seq} text: '${segment.toString()}'`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${glc(this, segment.removedClientId)} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`@tcli ${glc(this, this.collabWindow.clientId)}: map len: ${len} start: ${start} end: ${end} ` + segInfo);
            }
            if (go && (len > 0) && (start < len) && (end > 0)) {
                // found entry containing pos
                if (!child.isLeaf()) {
                    if (go) {
                        go = this.nodeMap(<Block>child, actions, pos, refSeq, clientId, accum, start, end);
                    }
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli ${glc(this, this.collabWindow.clientId)}: map leaf action`);
                    }
                    go = actions.leaf(<Segment>child, pos, refSeq, clientId, start, end, accum);
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

}




