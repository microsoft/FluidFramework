/// <reference path="base.d.ts" />
// TODO: use es6 map
export interface Attributes extends Object {
}

export interface TextSegment {
    content: string;
    attributes?: Attributes;
}

export interface TextSegmentAction {
    <TAccum>(textSegment: TextSegment, pos: number, accum?: TAccum): boolean;
}
// this is specialized to text; can generalize to Interval<TContent>
// represents a sequence of text segments; each text 
// segment can have distinct attributes; 
export function IntervalSpanningTree(initialText: string, attr: Attributes) {
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

    let root = initialNode(initialText, attr);

    // TODO: attributes
    function initialNode(text: string, attr: Attributes) {
        let seg = <TextSegment>{ content: text, attributes: attr };
        let node = makeNode(1);
        node.entries[0] = <Entry>{ text: seg };
        node.length = text.length;
        return node;
    }

    function isLeafNode(node: Node): boolean {
        return (node.liveEntryCount == 0) || (!node.entries[0].ref);
    }

    function getContainingInterval(pos: number) {
        if (pos !== undefined) {
            return search(root, pos);
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

    function setAttributes(pos: number, len: number, attributes: Attributes) {
        ensureIntervalBoundary(pos);
        ensureIntervalBoundary(pos + len);
        function intervalSetAttributes(textSegment: TextSegment) {
            extend(textSegment.attributes, attributes);
            return true;
        }
        mapRange(intervalSetAttributes, undefined, pos, pos + len);
    }

    function addSplitNodeToRoot(splitNode: Node) {
        if (splitNode === undefined) {
            return;
        }
        let newRoot = makeNode(2);
        newRoot.entries[0] = <Entry>{ text: root.entries[0].text, ref: root };
        newRoot.entries[1] = <Entry>{ text: splitNode.entries[0].text, ref: splitNode };
        nodeUpdateLength(newRoot);
        root = newRoot;
    }

    function insertInterval(pos: number, textSegment: TextSegment) {
        ensureIntervalBoundary(pos);
        let splitNode = nodeInsertBefore(root, pos, textSegment);
        if (splitNode) {
            addSplitNodeToRoot(splitNode);
        }
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
        if (splitNode) {
            addSplitNodeToRoot(splitNode);
        }
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

    function removeInterval(pos: number) {
        
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
                    go = action(entry.text, pos);
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
        diag: diag
    }

}




