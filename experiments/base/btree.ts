/// <reference path="base.d.ts" />

function BTree<TKey, TData>(compareKeys: Base.KeyComparer<TKey>): Base.SortedDictionary<TKey, TData> {
    interface Entry {
        key: TKey;
        data: TData;
        ref?: Node;
    }

    interface Node {
        childCount: number;
        children: Entry[];
    }

    const M = 4;
    function makeNode(childCount: number) {
        // assert childCount <= M
        return <Node>{ childCount: childCount, children: <Entry[]>new Array(M) };
    }

    let root = makeNode(0);
    function isEmpty() {
        return size() == 0;
    }
    let n = 0;
    let height = 0;

    function size() {
        return n;
    }

    function isLeafEntry(entry: Entry): boolean {
        return !entry.ref;
    }

    function getHeight() {
        return height;
    }

    function get(key: TKey) {
        if (key !== undefined) {
            return search(root, key, height);
        }
        // TODO: error on undefined
    }

    function search(node: Node, key: TKey, ht: number): Entry {
        let children = node.children;
        // external node
        if (ht == 0) {
            for (let i = 0; i < node.childCount; i++) {
                if (compareKeys(key, children[i].key) == 0) {
                    return children[i];
                }
            }
        }
        else {
            for (let i = 0; i < node.childCount; i++) {
                if (((i + 1) == node.childCount) || (compareKeys(key, children[i + 1].key))) {
                    return search(children[i].ref, key, ht - 1);
                }
            }
        }
    }

    function put(key: TKey, data: TData) {
        if (key !== undefined) {
            let splitNode = insert(root, key, data, height);
            n++;
            if (splitNode === undefined) {
                return;
            }
            let newRoot = makeNode(2);
            newRoot.children[0] = <Entry>{ key: root.children[0].key, data: undefined, ref: root };
            newRoot.children[1] = <Entry>{ key: splitNode.children[0].key, data: undefined, ref: splitNode };
            root = newRoot;
            height++;
        }
        // TODO: error on undefined
    }

    function insert(node: Node, key: TKey, data: TData, ht: number): Node {
        let childIndex: number;
        let entry = <Entry>{ key: key, data: data, next: undefined };
        // external node
        if (ht == 0) {
            for (childIndex = 0; childIndex < node.childCount; childIndex++) {
                if (compareKeys(key, node.children[childIndex].key) < 0) {
                    break;
                }
            }
        }
        else {
            for (childIndex = 0; childIndex < node.childCount; childIndex++) {
                if (((childIndex + 1) == node.childCount) || (compareKeys(key, node.children[childIndex + 1].key) < 0)) {
                    let splitNode = insert(node.children[childIndex++].ref, key, data, ht - 1);
                    if (splitNode === undefined) {
                        return undefined;
                    }
                    entry.key = splitNode.children[0].key;
                    entry.ref = splitNode;
                    break;
                }
            }
        }
        for (let i = node.childCount; i > childIndex; i--) {
            node.children[i] = node.children[i - 1];
        }
        node.children[childIndex] = entry;
        node.childCount++;
        if (node.childCount < M) {
            return undefined;
        }
        else {
            return split(node);
        }
    }

    function split(node: Node) {
        let halfCount = M / 2;
        let newNode = makeNode(halfCount);
        node.childCount = halfCount;
        for (let i = 0; i < halfCount; i++) {
            newNode.children[i] = node.children[(halfCount) + i];
        }
        return newNode;
    }

    function min() {
        if (!isEmpty()) {
            return nodeMin(root, height);
        }
    }

    function nodeMin(node: Node, ht: number) {
        if (ht == 0) {
            return node.children[0];
        }
        else {
            return nodeMin(node.children[0].ref, ht - 1);
        }
    }

    function max() {
        if (!isEmpty()) {
            return nodeMax(root, height);
        }
    }

    function nodeMax(node: Node, ht: number) {
        if (ht == 0) {
            return node.children[node.childCount - 1];
        }
        else {
            return nodeMax(node.children[node.childCount - 1].ref, ht - 1);
        }
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




