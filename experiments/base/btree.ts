/// <reference path="base.d.ts" />

function BTree<TKey, TData>(compareKeys: Base.KeyComparer<TKey>): Base.SortedDictionary<TKey, TData> {
    interface Entry {
        key: TKey;
        val: TData | Node;
        next: Node;
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

    function getHeight() {
        return height;
    }

    function get(key: TKey) {
        if (key !== undefined) {
            return search(root, key, height);
        }
        // TODO: error on undefined
    }

    function search(node: Node, key: TKey, ht: number) {
        let children = node.children;
        // external node
        if (ht == 0) {
            for (let i = 0; i < node.childCount; i++) {
                if (compareKeys(key, children[i].key) == 0) {
                    return <TData>children[i].val;
                }
            }
        }
        else {
            for (let i = 0; i < node.childCount; i++) {
                if (((i + 1) == node.childCount) || (compareKeys(key, children[i + 1].key))) {
                    return search(children[i].next, key, ht - 1);
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
            newRoot.children[0] = <Entry>{ key: root.children[0].key, val: undefined, next: root };
            newRoot.children[1] = <Entry>{ key: splitNode.children[0].key, val: undefined, next: splitNode };
            root = newRoot;
            height++;
        }
        // TODO: error on undefined
    }

    function insert(node: Node, key: TKey, data: TData, ht: number) {
        let childIndex: number;
        let entry = <Entry>{ key: key, val: data, next: undefined };
        // external node
        if (ht == 0) {
            for (childIndex=0;childIndex<node.childCount;childIndex++) {
                if (compareKeys(key, node.children[childIndex].key) < 0) {
                    break;
                }
            }
        }
        else {
            for (childIndex=0;childIndex<node.childCount;childIndex++) {
                
            }
        }
    }

}




}