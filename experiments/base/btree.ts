/// <reference path="base.d.ts" />

export default function BTree<TKey, TData>(compareKeys: Base.KeyComparer<TKey>): Base.SortedDictionary<TKey, TData> {
    interface Entry {
        key: TKey;
        data: TData;
        ref?: Node;
    }

    interface Node {
        liveEntryCount: number;
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

    function get(key: TKey) {
        if (key !== undefined) {
            return search(root, key);
        }
        // TODO: error on undefined
    }

    function search(node: Node, key: TKey): Entry {
        let children = node.entries;
        if (isLeafNode(node)) {
            for (let i = 0; i < node.liveEntryCount; i++) {
                if (compareKeys(key, children[i].key) == 0) {
                    return children[i];
                }
            }
        }
        else {
            for (let i = 0; i < node.liveEntryCount; i++) {
                if (((i + 1) == node.liveEntryCount) || (compareKeys(key, children[i + 1].key) < 0)) {
                    return search(children[i].ref, key);
                }
            }
        }
    }

    function put(key: TKey, data: TData) {
        if (key !== undefined) {
            let splitNode = insert(root, key, data);
            n++;
            if (splitNode === undefined) {
                return;
            }
            let newRoot = makeNode(2);
            newRoot.entries[0] = <Entry>{ key: root.entries[0].key, data: undefined, ref: root };
            newRoot.entries[1] = <Entry>{ key: splitNode.entries[0].key, data: undefined, ref: splitNode };
            root = newRoot;
        }
        // TODO: error on undefined
    }

    function insert(node: Node, key: TKey, data: TData): Node {
        let childIndex: number;
        let entry = <Entry>{ key: key, data: data, next: undefined };
        if (isLeafNode(node)) {
            for (childIndex = 0; childIndex < node.liveEntryCount; childIndex++) {
                if (compareKeys(key, node.entries[childIndex].key) < 0) {
                    break;
                }
            }
        }
        else {
            for (childIndex = 0; childIndex < node.liveEntryCount; childIndex++) {
                if (((childIndex + 1) == node.liveEntryCount) || (compareKeys(key, node.entries[childIndex + 1].key) < 0)) {
                    let splitNode = insert(node.entries[childIndex++].ref, key, data);
                    if (splitNode === undefined) {
                        return undefined;
                    }
                    entry.key = splitNode.entries[0].key;
                    entry.ref = splitNode;
                    break;
                }
            }
        }
        for (let i = node.liveEntryCount; i > childIndex; i--) {
            node.entries[i] = node.entries[i - 1];
        }
        node.entries[childIndex] = entry;
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

    function mapRange(action: Base.PropertyAction<TKey, TData>, start?: TKey, end?: TKey) {
        nodeMap(root, action, start, end);
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
        for (let i = 0; i < node.liveEntryCount; i++) {
            let entry = node.entries[i];
            let cmpStart = compareKeys(start, entry.key);
            let cmpEnd = compareKeys(end, entry.key);
            if (go && (cmpStart <= 0) && (cmpEnd >= 0)) {
                if (entry.ref !== undefined) {
                    go = nodeMap(entry.ref, action, accum, start, end);
                }
                else {
                    go = action(entry, accum);
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




