/// <reference path="base.d.ts" />
import * as RedBlack from "./redBlack";

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

export interface TextSegmentOpTree {
    map<TAccum>(actions: TextSegmentActions, refSeq: number, clientId: number, accum?: TAccum);
    mapRange<TAccum>(actions: TextSegmentActions, refSeq: number, clientId: number, accum?: TAccum, start?: number, end?: number);
    ensureIntervalBoundary(pos: number, refSeq: number, clientId: number);
    insertInterval(pos: number, refSeq: number, clientId: number, textSegment: TextSegment);
    removeRange(start: number, end: number, refSeq: number, clientId: number);
    markRangeRemoved(start: number, end: number, refSeq: number, clientId: number);
    getContainingSegment(pos: number, refSeq: number, clientId: number): TextSegment;
    createMarker(pos: number, refSeq: number, clientId: number): TextMarker;
    getOffset(entry: TextSegment, refSeq: number, clientId: number): number;
    getText(refSeq: number, clientId: number, start?: number, end?: number): string;
    getLength(refSeq: number, clientId: number): number;
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
    length: number;
    segments: TextSegment[];
    parent?: TextSegmentBlock;
}

export interface TextMarker {
    segment: TextSegment;
    offset: number;
}

export const AnySequenceNumber = -1;
export const AnyClientId = -1;

interface PartialLength {
    seq: number;
    partialLength: number;
    clientId?: number;
}

/**
 * Returns the partial length whose sequence number is 
 * the greatest sequence number within a that is
 * less than or equal to key.
 * @param a array of partial segment lenghts
 * @param key sequence number
 */
function maxLEQ(a: PartialLength[], key: number) {
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

class PartialTextLengths {
    minLength = 0;
    partialLengths: PartialLength[] = [];
    clientSeqNumbers: PartialLength[][] = [];

    cliLatestLEQ(clientId: number, refSeq: number) {
        let cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs) {
            return maxLEQ(cliSeqs, refSeq);
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

    get(refSeq: number, clientId: number) {
        let pLen = this.minLength;
        let seqIndex = maxLEQ(this.partialLengths, refSeq);
        let cliLatestindex = this.cliLatest(clientId);
        let cliSeq = this.clientSeqNumbers[clientId];
        let cliLatest = cliSeq[cliLatestindex];
        if (seqIndex > 0) {
            pLen += this.partialLengths[seqIndex].partialLength;
            if (cliLatestindex >= 0) {
                if (cliLatest.seq > refSeq) {
                    pLen += cliLatest.partialLength;
                    let precedingCliIndex = this.cliLatestLEQ(clientId, refSeq - 1);
                    if (precedingCliIndex >= 0) {
                        pLen -= cliSeq[precedingCliIndex].partialLength;
                    }
                }
            }
        }
        else {
            if (cliLatestindex >= 0) {
                pLen += cliLatest.partialLength;
            }
        }
        return pLen;
    }

    addClientSeqNumber(clientId: number, seq: number, segmentLengths: number[]) {
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        let cli = this.clientSeqNumbers[clientId];
        let pLen = segmentLengths[seq];
        if (cli.length > 0) {
            pLen += cli[cli.length - 1].partialLength;
        }
        cli.push({ seq: seq, partialLength: pLen });
    }

    combine(b: PartialTextLengths, segmentLengths: number[]) {
        let c = new PartialTextLengths();
        let i = 0, j = 0;
        let aLen = this.partialLengths.length;
        let bLen = b.partialLengths.length;
        let prevLen = 0;
        function addNext(partialLength: PartialLength) {
            let seq = partialLength.seq;
            let pLen = segmentLengths[seq] + prevLen;
            prevLen = pLen;
            c.partialLengths.push({
                seq: seq,
                clientId: partialLength.clientId,
                partialLength: pLen
            });
            c.addClientSeqNumber(partialLength.clientId, seq, segmentLengths);
        }
        while ((i < aLen) && (j < bLen)) {
            if (this.partialLengths[i].seq < b.partialLengths[j].seq) {
                addNext(this.partialLengths[i++]);
            }
            else {
                addNext(b.partialLengths[j++])
            }
        }

        while (i < aLen) {
            addNext(this.partialLengths[i++]);
        }
        while (j < bLen) {
            addNext(b.partialLengths[j++]);
        }
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

// represents a sequence of text segments
export function OpTree(text: string): TextSegmentOpTree {
    // should be a power of 2
    const MaxSegments = 4;
    function makeNode(liveSegmentCount: number) {
        // assert childCount <= MaxEntries
        return <TextSegmentBlock>{ liveSegmentCount: liveSegmentCount, segments: <TextSegment[]>new Array(MaxSegments) };
    }

    let root = initialNode(text);

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
        node.segments[0] = makeLeafSegment(node, text);
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
    function createMarker(pos: number, refSeq: number, clientId: number) {
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
        if (segment.child) {
            return segment.child.length;
        }
        else {
            if (segment.removedSeq) {
                return 0;
            }
            else {
                return segment.text.length;
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

    function extend(obj: any, props: any) {
        for (let key in props) {
            if (props.hasOwnProperty(key)) {
                obj[key] = props[key];
            }
        }
        return obj;
    }

    function updateRoot(splitNode: TextSegmentBlock, refSeq: number, clientId: number) {
        if (splitNode !== undefined) {
            let newRoot = makeNode(2);
            newRoot.segments[0] = makeInternalSegment(newRoot, root);
            newRoot.segments[1] = makeInternalSegment(newRoot, splitNode);
            root = newRoot;
        }
        nodeUpdateLength(root);
    }

    function insertInterval(pos: number, refSeq: number, clientId: number, textSegment: TextSegment) {
        ensureIntervalBoundary(pos, refSeq, clientId);
        let splitNode = nodeInsertBefore(root, pos, refSeq, clientId, textSegment);
        updateRoot(splitNode, refSeq, clientId);
    }

    function nodeInsertBefore(node: TextSegmentBlock, pos: number, refSeq: number, clientId: number, textSegment: TextSegment) {
        return insertingWalk(node, pos, refSeq, clientId, (segment: TextSegment, pos: number) => {
            if (!segment) {
                return <TextSegment>{
                    parent: node,
                    text: textSegment.text,
                };
            }
            else {
                let newSegment = copyLeafSegment(segment);
                segment.text = textSegment.text;
                return newSegment;
            }
        });
    }

    function splitLeafSegment(segment: TextSegment, pos: number) {
        if (pos > 0) {
            let remainingText = segment.text.substring(pos);
            segment.text = segment.text.substring(0, pos);
            return makeLeafSegment(segment.parent, remainingText);
        }
    }

    function ensureIntervalBoundary(pos: number, refSeq: number, clientId: number) {
        let splitNode = insertingWalk(root, pos, refSeq, clientId, splitLeafSegment);
        updateRoot(splitNode, refSeq, clientId);
    }

    function insertingWalk(node: TextSegmentBlock, pos: number, refSeq: number, clientId: number,
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
                    let splitNode = insertingWalk(segment.child, pos, refSeq, clientId, leafAction);
                    if (splitNode === undefined) {
                        nodeUpdateLength(node);
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
                nodeUpdateLength(node);
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
        nodeUpdateLength(node);
        nodeUpdateLength(newNode);
        return newNode;
    }

    function markRangeRemoved(start: number, end: number, refSeq: number, clientId: number) {
        ensureIntervalBoundary(start, refSeq, clientId);
        ensureIntervalBoundary(end, refSeq, clientId);
        function markRemoved(textSegment: TextSegment, pos: number, start: number, end: number) {
            textSegment.removedClientId = clientId;
            textSegment.removedSeq = refSeq;
            return true;
        }
        function afterMarkRemoved(node: TextSegmentBlock, pos: number, start: number, end: number) {
            nodeUpdateLength(node);
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
        nodeUpdateLength(node);
    }

    function nodeUpdateLength(node: TextSegmentBlock) {
        let len = 0;
        for (let i = 0; i < node.liveSegmentCount; i++) {
            len += segmentLength(node.segments[i], AnySequenceNumber, AnyClientId);
        }
        node.length = len;
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
            if (go && ((start < len)) && (end > 0)) {
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
        toString: toString,
        diag: diag
    }

}




