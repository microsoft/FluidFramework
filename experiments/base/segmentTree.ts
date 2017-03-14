/// <reference path="base.d.ts" />
import * as ListUtil from "./list";

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
    diag();
}

// internal (represents multiple leaf segments) if child is defined
export interface TextSegment {
    parent?: TextSegmentBlock;
    child?: TextSegmentBlock;
    // below only for leaves
    text?: string;
    markers?: TextMarker[];
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
                    let precedingCliIndex = this.cliLatestLEQ(clientId, refSeq - 1);
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

    static fromLeaves(combinedPartialLengths: PartialSequenceLengths, textSegmentBlock: TextSegmentBlock, segmentWindow: SegmentWindow) {
        combinedPartialLengths.minLength = 0;

        function insertSegment(segment: TextSegment, removedSeq = false) {
            let seq = segment.seq;
            let segmentLen = segment.text.length;
            if (removedSeq) {
                seq = segment.removedSeq;
                segmentLen = -segmentLen;
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
                let pLen = <PartialSequenceLength>{ seq: seq, clientId: segment.clientId, len: 0, seglen: segmentLen };
                if (indexFirstGTE < seqPartialsLen) {
                    // shift entries with greater sequence numbers
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

        for (let i = 0; i < textSegmentBlock.liveSegmentCount; i++) {
            let textSegment = textSegmentBlock.segments[i];
            if (textSegment.child === undefined) {
                // leaf segment
                if ((textSegment.seq === undefined) || (textSegment.seq <= segmentWindow.minSeq)) {
                    combinedPartialLengths.minLength += leafSegmentTotalLength(textSegment);
                }
                else {
                    insertSegment(textSegment);
                    if (textSegment.removedSeq) {
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
    static combine(textSegmentBlock: TextSegmentBlock, segmentWindow: SegmentWindow) {
        let combinedPartialLengths = new PartialSequenceLengths();
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
                childPartials.push(textSegment.child.partialLengths);
            }
        }
        let childPartialsLen = childPartials.length
        if (childPartialsLen != 0) {
            // some children are interior nodes
            if (combinedPartialLengths.partialLengths.length > 0) {
                // some children were leaves; add combined partials from these segments 
                childPartials.push(combinedPartialLengths);
                childPartialsLen++;
                combinedPartialLengths = new PartialSequenceLengths();
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

function makeLeafSegmentFromSplit(parent: TextSegmentBlock, text: string, origSegment: TextSegment) {
    return <TextSegment>{
        parent: parent,
        text: text,
        seq: origSegment.seq,
        clientId: origSegment.clientId,
        removedSeq: origSegment.removedSeq,
        removedClientId: origSegment.removedClientId
    };
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
        clientId: textSegment.clientId
    };
    if (newSegment.markers) {
        for (let i = 0, len = newSegment.markers.length; i < len; i++) {
            newSegment.markers[i].segment = newSegment;
        }
    }
    return newSegment;
}

export class TestClient {
    segTree: SegmentTree;

    constructor(initText: string) {
        this.segTree = segmentTree(initText);
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
        this.segTree.insertInterval(pos, refSeq, clientId, seq, textSegment);
    }

    insertSegmentRemote(text: string, pos: number, seq: number, refSeq: number, clientId: number) {
        let segWindow = this.segTree.getSegmentWindow();
        let textSegment = <TextSegment>{
            text: text,
            seq: seq,
            clientId: clientId
        };
        this.segTree.insertInterval(pos, refSeq, clientId, seq, textSegment);
    }

    relText(clientId: number, refSeq: number) {
        return `cli: ${clientId} refSeq: ${refSeq}: ` + this.segTree.getText(refSeq, clientId);
    }

    static firstTest() {
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
        cli.insertSegmentRemote("yyy",0,2,0,0);
        cli.insertSegmentRemote("zzz",2,3,1,3);
        cli.insertSegmentRemote("EAGLE",1,4,1,4);
        cli.insertSegmentRemote("HAS",4,5,1,5);
        cli.insertSegmentLocal(" LANDED",19);
        cli.insertSegmentRemote("yowza: ",0,6,4,2);
        cli.segTree.ackPendingSegment(7);
        console.log(cli.segTree.toString());
        for (let clientId = 0; clientId < 6; clientId++) {
            for (let refSeq = 0; refSeq < 8; refSeq++) {
                console.log(cli.relText(clientId, refSeq));
            }
        }
        
    }

    startCollaboration(localClientId: number) {
        this.segTree.startCollaboration(localClientId);
    }
}

// represents a sequence of text segments
export function segmentTree(text: string): SegmentTree {
    // should be a power of 2
    const MaxSegments = 4;
    function makeNode(liveSegmentCount: number) {
        // assert childCount <= MaxEntries
        return <TextSegmentBlock>{ liveSegmentCount: liveSegmentCount, segments: <TextSegment[]>new Array(MaxSegments) };
    }

    let root = initialNode(text);
    let segmentWindow = new SegmentWindow();
    let pendingSegments: ListUtil.List<TextSegment>;

    // for now assume min starts at zero
    function startCollaboration(localClientId: number) {
        segmentWindow.clientId = localClientId;
        segmentWindow.minSeq = 0;
        segmentWindow.collaborating = true;
        segmentWindow.currentSeq = 0;
        pendingSegments = ListUtil.ListMakeHead();
    }

    function getSegmentWindow() {
        return segmentWindow;
    }

    function getLength(refSeq: number, clientId: number) {
        return root.length;
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
    // TODO: discriminate by sequence number
    function gatherText(textSegment: TextSegment, pos: number, refSeq: number, clientId: number, start: number, end: number, accumText: TextSegment) {
        if (textSegment.removedSeq === undefined) {
            accumText.text += textSegment.text;
        }
        return true;
    }

    function getText(refSeq: number, clientId: number, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = root.length;
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
                    if ((segment.removedSeq !== undefined) && (segment.removedSeq <= refSeq)) {
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
        let pendingSegment = pendingSegments.dequeue();
        if (pendingSegment !== undefined) {
            pendingSegment.seq = seq;
            console.log(`set pending segment with text ${pendingSegment.text} to sequence number ${seq}`);
            nodeUpdateLength(pendingSegment.parent, seq);
        }
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
                    pendingSegments.enqueue(locSegment);
                    console.log(`saved local seg with text: ${locSegment.text}`);
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
                saveIfLocal(segment);
                return newSegment;
            }
        });
    }

    function splitLeafSegment(segment: TextSegment, pos: number) {
        if (pos > 0) {
            let remainingText = segment.text.substring(pos);
            segment.text = segment.text.substring(0, pos);
            return makeLeafSegmentFromSplit(segment.parent, remainingText, segment);
        }
    }

    function ensureIntervalBoundary(pos: number, refSeq: number, clientId: number) {
        let splitNode = insertingWalk(root, pos, refSeq, clientId, UniversalSequenceNumber, splitLeafSegment);
        updateRoot(splitNode, refSeq, clientId);
    }

    function insertingWalk(node: TextSegmentBlock, pos: number, refSeq: number, clientId: number, seq: number,
        leafAction: (segment: TextSegment, pos: number) => TextSegment) {
        let segments = node.segments;
        let segmentIndex: number;
        let segment: TextSegment;
        let newSegment: TextSegment;
        for (segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            segment = segments[segmentIndex];
            let len = segmentLength(segment, refSeq, clientId);
            if (pos < len) {
                // found entry containing pos
                if (segment.child) {
                    //internal node
                    let splitNode = insertingWalk(segment.child, pos, refSeq, clientId, seq, leafAction);
                    if (splitNode === undefined) {
                        nodeUpdateLength(node, seq);
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
                nodeUpdateLength(node, seq);
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
        }
        nodeUpdateLengthNewStructure(node);
        nodeUpdateLengthNewStructure(newNode);
        return newNode;
    }

    function markRangeRemoved(start: number, end: number, refSeq: number, clientId: number, seq: number) {
        ensureIntervalBoundary(start, refSeq, clientId);
        ensureIntervalBoundary(end, refSeq, clientId);
        function markRemoved(textSegment: TextSegment, pos: number, start: number, end: number) {
            textSegment.removedClientId = clientId;
            textSegment.removedSeq = seq;
            return true;
        }
        function afterMarkRemoved(node: TextSegmentBlock, pos: number, start: number, end: number) {
            nodeUpdateLength(node, seq);
            return true;
        }
        mapRange({ leaf: markRemoved, post: afterMarkRemoved }, refSeq, clientId, undefined, start, end);
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

    function nodeUpdateLength(node: TextSegmentBlock, seq: number) {
        nodeUpdateTotalLength(node);
        // TODO: optimize merge by adding only single sequence number seq
        if (segmentWindow.collaborating) {
            node.partialLengths = PartialSequenceLengths.combine(node, segmentWindow);
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
            strbuf += `Node (len ${node.length}) with ${node.liveSegmentCount} live segments:\n`;
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

    function nodeMap<TAccum>(node: TextSegmentBlock, actions: TextSegmentActions, pos: number, refSeq: number,
        clientId: number, accum?: TAccum, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = root.length;
        }
        let go = true;
        let segments = node.segments;
        for (let segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            let segment = segments[segmentIndex];
            let len = segmentLength(segment, refSeq, clientId);
            if (go && (len > 0) && (start < len) && (end > 0)) {
                // found entry containing pos
                if (segment.child) {
                    // internal node
                    if (actions.pre) {
                        go = actions.pre(segment.child, pos, refSeq, clientId, start, end, accum);
                    }
                    if (go) {
                        go = nodeMap(segment.child, actions, pos, refSeq, clientId, accum, start, end);
                    }
                    if (go && actions.post) {
                        go = actions.post(segment.child, pos, refSeq, clientId, start, end, accum);
                    }
                }
                else {
                    go = actions.leaf(segment, pos, refSeq, clientId, start, end, accum);
                }
            }
            pos += len;
            start -= len;
            end -= len;
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
        toString: toString,
        diag: diag
    }

}




