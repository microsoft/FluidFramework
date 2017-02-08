/// <reference path="base.d.ts" />
// TODO: use es6 map
export interface Attributes extends Object {
}

export interface TextSegment {
    content: string;
    attributes?: Attributes;
}

export interface TextSegmentTree {
    map<TAccum>(action: TextSegmentAction, accum?: TAccum);
    mapRange<TAccum>(action: TextSegmentAction, accum?: TAccum, start?: number, end?: number);
    ensureIntervalBoundary(pos:number);
    setAttributes(start: number, end: number, attriburtes: Attributes);
    insertInterval(pos: number, textSegment: TextSegment);
    removeRange(start: number, end: number);
    getContainingInterval(pos: number): TextSegment;
    getText(start?: number, end?:  number): string;
    diag();
}

export interface TextSegmentAction {
    <TAccum>(textSegment: TextSegment, pos: number, accum?: TAccum): boolean;
}
// this is specialized to text; can generalize to Interval<TContent>
// represents a sequence of text segments; each text 
// segment can have distinct attributes; 
export function IntervalSpanningTree(seg: TextSegment): TextSegmentTree {
    interface Entry {
        text: TextSegment;
        ref?: Node;
    }

    interface Node {
        liveEntryCount: number;
        length: number;
        entries: Entry[];
    }

    // should be a power of 2
    const MaxEntries = 4;
    function makeNode(liveEntryCount: number) {
        // assert childCount <= MaxEntries
        return <Node>{ liveEntryCount: liveEntryCount, entries: <Entry[]>new Array(MaxEntries) };
    }

    let root = initialNode(seg);

    // TODO: attributes
    function initialNode(seg: TextSegment) {
        let node = makeNode(1);
        node.entries[0] = <Entry>{ text: seg };
        node.length = seg.content.length;
        return node;
    }

    function isLeafNode(node: Node): boolean {
        return (node.liveEntryCount == 0) || (!node.entries[0].ref);
    }

    // TODO: handle start and end positions
    function gatherText(textSegment: TextSegment, pos: number, accumText: TextSegment) {
        accumText.content += textSegment.content;
        return true;
    }

    function getText(start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = root.length;
        }
        let accum = { content: "" };
        mapRange(gatherText,accum,start,end);
        return accum.content;
    }

    function getContainingInterval(pos: number) {
        if (pos !== undefined) {
            let entry = search(root, pos);
            if (entry) {
                return entry.text;
            }
        }
        // TODO: error on undefined
    }

    function entryLength(entry: Entry) {
        if (entry.ref) {
            return entry.ref.length;
        }
        else {
            return entry.text.content.length;
        }
    }

    function search(node: Node, pos: number): Entry {
        let entries = node.entries;
        for (let entryIndex = 0; entryIndex < node.liveEntryCount; entryIndex++) {
            let entry = entries[entryIndex];
            let len = entryLength(entry);
            if (pos < len) {
                // found entry containing pos
                if (entry.ref) {
                    // internal node
                    return search(entry.ref, pos);
                }
                else {
                    return entry;
                }
            }
            else {
                pos -= len;
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

    function setAttributes(start: number, end: number, attributes: Attributes) {
        ensureIntervalBoundary(start);
        ensureIntervalBoundary(end);
        function intervalSetAttributes(textSegment: TextSegment) {
            extend(textSegment.attributes, attributes);
            return true;
        }
        mapRange(intervalSetAttributes, undefined, start, end);
    }

    function updateRoot(splitNode: Node) {
        if (splitNode !== undefined) {
            let newRoot = makeNode(2);
            newRoot.entries[0] = <Entry>{ text: root.entries[0].text, ref: root };
            newRoot.entries[1] = <Entry>{ text: splitNode.entries[0].text, ref: splitNode };
            root = newRoot;
        }
        nodeUpdateLength(root);
    }

    function insertInterval(pos: number, textSegment: TextSegment) {
        ensureIntervalBoundary(pos);
        let splitNode = nodeInsertBefore(root, pos, textSegment);
        updateRoot(splitNode);
    }

    function nodeInsertBefore(node: Node, pos: number, textSegment: TextSegment) {
        return insertingWalk(node, pos, (entry: Entry, pos: number) => {
            let newEntry = <Entry>{ text: entry.text };
            entry.text = textSegment;
            return newEntry;
        });
    }

    function splitLeafEntry(entry: Entry, pos: number) {
        if (pos > 0) {
            let remainingText = entry.text.content.substring(pos);
            entry.text.content = entry.text.content.substring(0, pos);
            return <Entry>{
                text: {
                    content: remainingText,
                    attributes: extend({}, entry.text.attributes)
                }
            };
        }
    }

    function ensureIntervalBoundary(pos: number) {
        let splitNode = insertingWalk(root, pos, splitLeafEntry);
        updateRoot(splitNode);
    }

    function insertingWalk(node: Node, pos: number, leafAction: (entry: Entry, pos: number) => Entry) {
        let entries = node.entries;
        let entryIndex: number;
        let entry: Entry;
        let newEntry: Entry;
        for (entryIndex = 0; entryIndex < node.liveEntryCount; entryIndex++) {
            entry = entries[entryIndex];
            let len = entryLength(entry);
            if (pos < len) {
                // found entry containing pos
                if (entry.ref) {
                    //internal node
                    let splitNode = insertingWalk(entry.ref, pos, leafAction);
                    if (splitNode === undefined) {
                        return undefined;
                    }
                    newEntry = <Entry>{ ref: splitNode, text: undefined };
                    entryIndex++; // insert after
                }
                else {
                    newEntry = leafAction(entry, pos);
                    if (newEntry) {
                        entryIndex++; // insert after
                    }
                    else {
                        // already an interval at this position
                        return undefined;
                    }
                }
                break;
            }
            else {
                pos -= len;
            }
        }
        if (newEntry) {
            for (let i = node.liveEntryCount; i > entryIndex; i--) {
                node.entries[i] = node.entries[i - 1];
            }
            node.entries[entryIndex] = newEntry;
            node.liveEntryCount++;
            if (node.liveEntryCount < MaxEntries) {
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

    function split(node: Node) {
        let halfCount = MaxEntries / 2;
        let newNode = makeNode(halfCount);
        node.liveEntryCount = halfCount;
        for (let i = 0; i < halfCount; i++) {
            newNode.entries[i] = node.entries[(halfCount) + i];
        }
        nodeUpdateLength(node);
        nodeUpdateLength(newNode);
        return newNode;
    }

    function removeRange(start: number, end: number) {
        nodeRemoveRange(root, start, end);
    }

    function nodeRemoveRange(node: Node, start: number, end: number) {
        let entries = node.entries;
        let startIndex: number;
        if (start < 0) {
            startIndex = -1;
        }
        let endIndex = node.liveEntryCount;
        for (let entryIndex = 0; entryIndex < node.liveEntryCount; entryIndex++) {
            let entry = entries[entryIndex];
            let len = entryLength(entry);
            if ((start >= 0) && (start < len)) {
                startIndex = entryIndex;
                if (entry.ref) {
                    // internal node
                    nodeRemoveRange(entry.ref, start, end);
                }
                else {
                    let remnantString = "";
                    if (start > 0) {
                        remnantString += entry.text.content.substring(0, start);
                    }
                    if (end < len) {
                        remnantString += entry.text.content.substring(end);
                    }
                    entry.text.content = remnantString;
                    if (remnantString.length == 0) {
                        startIndex--;
                    }
                }
            }
            if (end <= len) {
                endIndex = entryIndex;
                if (end > 0) {
                    if (endIndex > startIndex) {
                        if (entry.ref) {
                            nodeRemoveRange(entry.ref, start, end);
                        }
                        else {
                            entry.text.content = entry.text.content.substring(0, end);
                            if (entry.text.content.length == 0) {
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
        if (deleteCount > 0) {
            // delete nodes in middle of range
            if (endIndex < node.liveEntryCount) {
                for (let j = 1; j <= deleteCount; j++) {
                    entries[startIndex + j] = entries[endIndex + j - 1];
                }
            }
            node.liveEntryCount -= deleteCount;
        }
        nodeUpdateLength(node);
    }

    function nodeUpdateLength(node: Node) {
        let len = 0;
        for (let i = 0; i < node.liveEntryCount; i++) {
            len += entryLength(node.entries[i]);
        }
        node.length = len;
    }

    function map<TAccum>(action: TextSegmentAction, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        nodeMap(root, action, 0, accum);
    }

    function mapRange<TAccum>(action: TextSegmentAction, accum?: TAccum, start?: number, end?: number) {
        nodeMap(root, action, 0, accum, start, end);
    }

    function nodeMap<TAccum>(node: Node, action: TextSegmentAction, pos: number,
        accum?: TAccum, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = root.length;
        }
        let go = true;
        let entries = node.entries;
        for (let entryIndex = 0; entryIndex < node.liveEntryCount; entryIndex++) {
            let entry = entries[entryIndex];
            let len = entryLength(entry);
            if (go && ((start < len)) && (end >= len)) {
                // found entry containing pos
                if (entry.ref) {
                    // internal node
                    go = nodeMap(entry.ref, action, pos, accum, start, end);
                }
                else {
                    go = action(entry.text, pos, accum);
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
        getContainingInterval: getContainingInterval,
        ensureIntervalBoundary: ensureIntervalBoundary,
        setAttributes: setAttributes,
        insertInterval: insertInterval,
        removeRange: removeRange,
        getText: getText,
        diag: diag
    }

}




