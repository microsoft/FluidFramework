/// <reference path="base.d.ts" />

export interface TextSegmentAction {
    <TAccum>(text: string, pos: number, accum?: TAccum): boolean;
}
// this is specialized to text; can generalize to Interval<TContent>
// represents a sequence of text segments; each text 
// segment can have distinct attributes; 
export function IntervalSpanningTree(initialText: string) {
    interface TextSegment {
        content: string;
        // attributes
    }

    interface Entry {
        key: TextSegment;
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

    let root = initialNode(initialText);

    // TODO: attributes
    function initialNode(text: string) {
        let seg = <TextSegment>{ content: text };
        let node = makeNode(1);
        node.entries[0] = <Entry>{ key: seg };
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
            return entry.key.content.length;
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

    // splice text segment into spanning intervals at position
    // truncate containing interval
    function spliceAt(textSegment: TextSegment, pos: number) {
        if (textSegment !== undefined) {
            let splitNode = spliceNodeAt(root, textSegment, pos);
            if (splitNode === undefined) {
                return;
            }
            let newRoot = makeNode(2);
            newRoot.entries[0] = <Entry>{ key: root.entries[0].key, ref: root };
            newRoot.entries[1] = <Entry>{ key: splitNode.entries[0].key, ref: splitNode };
            root = newRoot;
        }
        // TODO: error on undefined
        // TODO: error on pos greater than root length
    }

    function spliceNodeAt(node: Node, textSegment: TextSegment, pos: number): Node {
        let entries = node.entries;
        let entryIndex: number;
        let newEntry = <Entry>{ key: textSegment };
        let entry: Entry;
        for (let entryIndex = 0; entryIndex < node.liveEntryCount; entryIndex++) {
            entry = entries[entryIndex];
            let len = entryLength(entry);
            if (pos < len) {
                // found entry containing pos
                if (entry.ref) {
                    // internal node
                    let splitNode = spliceNodeAt(node.entries[entryIndex].ref, textSegment, pos);
                    if (splitNode === undefined) {
                        return undefined;
                    }
                    newEntry.key = splitNode.entries[0].key;
                    newEntry.ref = splitNode;
                }
                else {
                    // truncate containing Interval
                    entry.key.content = entry.key.content.substring(0, pos);
                }
                entryIndex++; // insert after 
                break;
            }
            else {
                pos -= len;
            }
        }
        for (let i = node.liveEntryCount; i > entryIndex; i--) {
            node.entries[i] = node.entries[i - 1];
        }
        node.entries[entryIndex] = newEntry;
        node.liveEntryCount++;
        if (node.liveEntryCount < MaxEntries) {
            return undefined;
        }
        else {
            return split(node);
        }
    }

    function split(node: Node) {
        let halfCount = MaxEntries / 2;
        let newNode = makeNode(halfCount);
        node.liveEntryCount = halfCount;
        for (let i = 0; i < halfCount; i++) {
            newNode.entries[i] = node.entries[(halfCount) + i];
        }
        return newNode;
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
            end = root.length - 1;
        }
        let go = true;
        let entries = node.entries;
        for (let entryIndex = 0; entryIndex < node.liveEntryCount; entryIndex++) {
            let entry = entries[entryIndex];
            let len = entryLength(entry);
            if (go && ((start >= 0) && (start < len)) && (end >=0)) {
                // found entry containing pos
                if (entry.ref) {
                    // internal node
                    go = nodeMap(entry.ref, action, pos, accum, start, end);
                }
                else {
                    go = action(entry.key.content, pos);
                }
            }
            start -= len;
            end -= len;
            pos += len;
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
        spliceAt: spliceAt,
        diag: diag
    }

}




