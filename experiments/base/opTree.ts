/// <reference path="base.d.ts" />

export interface TextSegmentAction {
    <TAccum>(textSegment: TextSegment, pos: number, start: number, end: number, accum?: TAccum): boolean;
}

export interface TextSegmentBlockAction {
    <TAccum>(textSegmentBlock: TextSegmentBlock, pos: number, start: number, end: number, accum?: TAccum): boolean;
}

export interface TextSegmentActions {
    leaf: TextSegmentAction;
    pre?: TextSegmentBlockAction;
    post?: TextSegmentBlockAction;
}

export interface TextSegmentTree {
    map<TAccum>(actions: TextSegmentActions, accum?: TAccum);
    mapRange<TAccum>(actions: TextSegmentActions, accum?: TAccum, start?: number, end?: number);
    ensureIntervalBoundary(pos: number);
    insertInterval(pos: number, textSegment: TextSegment);
    removeRange(start: number, end: number);
    markRangeRemoved(start: number, end: number, sequenceNumber: number, clientId: number);
    getContainingSegment(pos: number): TextSegment;
    createMarker(pos: number): TextMarker;
    getOffset(entry: TextSegment): number;
    getText(start?: number, end?: number): string;
    getLength(): number;
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

// this is specialized to text; can generalize to Interval<TContent>
// represents a sequence of text segments; each text 
// segment can have distinct attributes; 
export function OpTree(text: string): TextSegmentTree {
    // should be a power of 2
    const MaxSegments = 4;
    function makeNode(liveSegmentCount: number) {
        // assert childCount <= MaxEntries
        return <TextSegmentBlock>{ liveSegmentCount: liveSegmentCount, segments: <TextSegment[]>new Array(MaxSegments) };
    }

    let root = initialNode(text);

    function getLength() {
        return root.length;
    }

    function getOffset(leafSegment: TextSegment) {
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
                    totalOffset += segmentLength(segment);
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
    function gatherText(textSegment: TextSegment, pos: number, start: number, end: number, accumText: TextSegment) {
        if (textSegment.removedSeq === undefined) {
            accumText.text += textSegment.text;
        }
        return true;
    }

    function getText(start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = root.length;
        }
        let accum = <TextSegment>{ text: "" };
        mapRange({ leaf: gatherText }, accum, start, end);
        return accum.text;
    }

    function getContainingSegment(pos: number) {
        if (pos !== undefined) {
            return search(root, pos);
        }
        // TODO: error on undefined
    }

    // TODO: change to assign to passed in marker
    function createMarker(pos: number) {
        let marker = <TextMarker>{ segment: undefined, offset: undefined };
        function updateMarker(segment: TextSegment, pos: number, start: number) {
            marker.offset = start;
            marker.segment = segment;
            return true;
        }
        search(root, pos, updateMarker, marker);
        return marker;
    }

    function segmentLength(segment: TextSegment) {
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

    function search<TAccum>(node: TextSegmentBlock, pos: number, action?: TextSegmentAction, accum?: TAccum): TextSegment {
        let segments = node.segments;
        let start = pos;
        for (let segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            let segment = segments[segmentIndex];
            let len = segmentLength(segment);
            if (start < len) {
                // found entry containing pos
                if (segment.child) {
                    // internal node
                    return search(segment.child, pos, action);
                }
                else {
                    if (action) {
                        action(segment, pos, start, -1, accum);
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

    function updateRoot(splitNode: TextSegmentBlock) {
        if (splitNode !== undefined) {
            let newRoot = makeNode(2);
            newRoot.segments[0] = makeInternalSegment(newRoot, root);
            newRoot.segments[1] = makeInternalSegment(newRoot, splitNode);
            root = newRoot;
        }
        nodeUpdateLength(root);
    }

    function insertInterval(pos: number, textSegment: TextSegment) {
        ensureIntervalBoundary(pos);
        let splitNode = nodeInsertBefore(root, pos, textSegment);
        updateRoot(splitNode);
    }

    function nodeInsertBefore(node: TextSegmentBlock, pos: number, textSegment: TextSegment) {
        return insertingWalk(node, pos, (segment: TextSegment, pos: number) => {
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

    function ensureIntervalBoundary(pos: number) {
        let splitNode = insertingWalk(root, pos, splitLeafSegment);
        updateRoot(splitNode);
    }

    function insertingWalk(node: TextSegmentBlock, pos: number, leafAction: (segment: TextSegment, pos: number) => TextSegment) {
        let segments = node.segments;
        let segmentIndex: number;
        let segment: TextSegment;
        let newSegment: TextSegment;
        for (segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            segment = segments[segmentIndex];
            let len = segmentLength(segment);
            if (pos < len) {
                // found entry containing pos
                if (segment.child) {
                    //internal node
                    let splitNode = insertingWalk(segment.child, pos, leafAction);
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

    function markRangeRemoved(start: number, end: number, sequenceNumber: number, clientId: number) {
        ensureIntervalBoundary(start);
        ensureIntervalBoundary(end);
        console.log(toString());
        function markRemoved(textSegment: TextSegment, pos: number, start: number, end: number) {
            textSegment.removedClientId = clientId;
            textSegment.removedSeq = sequenceNumber;
            return true;
        }
        function afterMarkRemoved(node: TextSegmentBlock, pos: number, start: number, end: number) {
            nodeUpdateLength(node);
            return true;
        }
        mapRange({ leaf: markRemoved, post: afterMarkRemoved }, undefined, start, end);
    }

    function removeRange(start: number, end: number) {
        nodeRemoveRange(root, start, end);
    }

    function nodeRemoveRange(node: TextSegmentBlock, start: number, end: number) {
        let segments = node.segments;
        let startIndex: number;
        if (start < 0) {
            startIndex = -1;
        }
        let endIndex = node.liveSegmentCount;
        for (let segmentIndex = 0; segmentIndex < node.liveSegmentCount; segmentIndex++) {
            let segment = segments[segmentIndex];
            let len = segmentLength(segment);
            if ((start >= 0) && (start < len)) {
                startIndex = segmentIndex;
                if (segment.child) {
                    // internal node
                    nodeRemoveRange(segment.child, start, end);
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
                            nodeRemoveRange(segment.child, start, end);
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
            len += segmentLength(node.segments[i]);
        }
        node.length = len;
    }

    function map<TAccum>(actions: TextSegmentActions, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        nodeMap(root, actions, 0, accum);
    }

    function mapRange<TAccum>(actions: TextSegmentActions, accum?: TAccum, start?: number, end?: number) {
        nodeMap(root, actions, 0, accum, start, end);
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

    function nodeMap<TAccum>(node: TextSegmentBlock, actions: TextSegmentActions, pos: number,
        accum?: TAccum, start?: number, end?: number) {
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
            let len = segmentLength(segment);
            if (go && ((start < len)) && (end >= len)) {
                // found entry containing pos
                if (segment.child) {
                    // internal node
                    if (actions.pre) {
                        go = actions.pre(segment.child, pos, start, end, accum);
                    }
                    if (go) {
                        go = nodeMap(segment.child, actions, pos, accum, start, end);
                    }
                    if (go && actions.post) {
                        go = actions.post(segment.child, pos, start, end, accum);
                    }
                }
                else {
                    go = actions.leaf(segment, pos, start, end, accum);
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




