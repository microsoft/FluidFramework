/// <reference path="base.d.ts" />

// this is specialized to text; can generalize to Interval<TContent>
export default function IntervalSpanningTree() {
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
        subTreeLength: number;
        entries: Entry[];
    }

    // should be a power of 2
    const MaxEntries = 4;
    function makeNode(liveEntryCount: number) {
        // assert childCount <= MaxEntries
        return <Node>{ liveEntryCount: liveEntryCount, entries: <Entry[]>new Array(MaxEntries) };
    }

    let root = makeNode(0);
    function isEmpty() {
        return size() == 0;
    }
    let n = 0;
    function size() {
        return n;
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
            return entry.ref.subTreeLength;
        }
        else {
            return entry.key.content.length;
        }
    }

    function search(node: Node, pos: number): Entry {
        let entries = node.entries;
        for (let entryIndex = 0;entryIndex<node.liveEntryCount;entryIndex++) {
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

    function put(ival: TextSegment, pos: number) {
        if (ival !== undefined) {
            let splitNode = insert(root, ival, pos);
            n++;
            if (splitNode === undefined) {
                return;
            }
            let newRoot = makeNode(2);
            newRoot.entries[0] = <Entry>{ key: root.entries[0].key, ref: root };
            newRoot.entries[1] = <Entry>{ key: splitNode.entries[0].key, ref: splitNode };
            root = newRoot;
        }
        // TODO: error on undefined
    }

    function insert(node: Node, ival: TextSegment, pos: number): Node {
        let entries = node.entries;
        let entryIndex: number;
        let leafEntry = <Entry>{ key: ival };
        let entry: Entry;
        for (let entryIndex = 0;entryIndex<node.liveEntryCount;entryIndex++) {
            entry = entries[entryIndex];
            let len = entryLength(entry);
            if (pos < len) {
                // found entry containing pos
                if (entry.ref) {
                    // internal node
                    let splitNode = insert(node.entries[entryIndex++].ref, ival, pos);
                    if (splitNode === undefined) {
                        return undefined;
                    }
                    entry.key = splitNode.entries[0].key;
                    entry.ref = splitNode;
                }
                break;
            }
            else {
                pos -= len;
            }
        }

        for (let i = node.liveEntryCount; i > entryIndex; i--) {
            node.entries[i] = node.entries[i - 1];
        }
        node.entries[entryIndex] = entry;
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

    function min() {
        if (!isEmpty()) {
            return nodeMin(root);
        }
    }

    function nodeMin(node: Node) {
        if (isLeafNode(node)) {
            return node.entries[0];
        }
        else {
            return nodeMin(node.entries[0].ref);
        }
    }

    function max() {
        if (!isEmpty()) {
            return nodeMax(root);
        }
    }

    function nodeMax(node: Node) {
        if (isLeafNode(node)) {
            return node.entries[node.liveEntryCount - 1];
        }
        else {
            return nodeMax(node.entries[node.liveEntryCount - 1].ref);
        }
    }

    function map<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        nodeMap(root, action, accum);
    }

    function mapRange<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey) {
        nodeMap(root, action, accum, start, end);
    }

    function nodeMap<TAccum>(node: Node, action: Base.PropertyAction<TKey, TData>,
        accum?: TAccum, start?: TKey, end?: TKey) {
        if (start === undefined) {
            start = nodeMin(node).key;
        }
        if (end === undefined) {
            end = nodeMax(node).key;
        }
        let go = true;
        let entries = node.entries;
        if (isLeafNode(node)) {
            for (let i = 0; i < node.liveEntryCount; i++) {
                if (go && (compareKeys(start, entries[i].key) <= 0) && (compareKeys(end, entries[i].key) >= 0)) {
                    go = action(entries[i], accum);
                }
            }
        }
        else {
            for (let i = 0; i < node.liveEntryCount; i++) {
                if ((((i + 1) == node.liveEntryCount) || (compareKeys(start, entries[i + 1].key) <= 0)) &&
                    ((i == 0) || (compareKeys(end, entries[i].key) >= 0))) {
                    go = nodeMap(entries[i].ref, action, accum, start, end);
                }
            }
        }
        return go;
    }

    function remove(key: TKey) {
        // TODO
    }

    function diag() {
        // TODO 
    }
    return {
        min: min,
        max: max,
        map: map,
        mapRange: mapRange,
        remove: remove,
        get: get,
        put: put,
        diag: diag
    }

}




