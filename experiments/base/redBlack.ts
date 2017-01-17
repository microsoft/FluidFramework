/// <reference path="base.d.ts" />

export function LinearDictionary<TKey, TData>(compareKeys: Base.KeyComparer<TKey>): Base.SortedDictionary<TKey, TData> {
    let a: Base.Property<TKey, TData>[] = [];
    function compareProps(a: Base.Property<TKey, TData>, b: Base.Property<TKey, TData>) {
        return compareKeys(a.key, b.key);
    }
    function diag() {
        console.log(`size is ${a.length}`);
    }
    function mapRange<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey) {
        if (start === undefined) {
            start = min().key;
        }
        if (end === undefined) {
            end = max().key;
        }
        for (let i = 0, len = a.length; i < len; i++) {
            if (compareKeys(start, a[i].key) <= 0) {
                let ecmp = compareKeys(end, a[i].key);
                if (ecmp < 0) {
                    break;
                }
                if (!action(a[i], accum)) {
                    break;
                }
            }
        }
    }

    function map<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum) {
        mapRange(action, accum);
    }

    function min() {
        if (a.length > 0) {
            return a[0];
        }
    }
    function max() {
        if (a.length > 0) {
            return a[a.length - 1];
        }
    }

    function get(key: TKey) {
        for (let i = 0, len = a.length; i < len; i++) {
            if (a[i].key == key) {
                return a[i];
            }
        }
    }

    function put(key: TKey, data: TData) {
        if (key) {
            if (data === undefined) {
                remove(key);
            }
            else {
                a.push({ key: key, data: data });
                a.sort(compareProps); // go to insertion sort if too slow
            }
        }
    }
    function remove(key: TKey) {
        if (key) {
            for (let i = 0, len = a.length; i < len; i++) {
                if (a[i].key == key) {
                    a[i] = a[len - 1];
                    a.length--;
                    a.sort(compareProps);
                    break;
                }
            }
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

export function RedBlackTree<TKey, TData>(compareKeys: Base.KeyComparer<TKey>): Base.SortedDictionary<TKey, TData> {
    const enum Color {
        RED,
        BLACK
    }
    interface Node {
        key: TKey;
        data: TData;
        left: Node;
        right: Node;
        color: Color;
        size: number;
    }
    function makeNode(key: TKey, data: TData, color: Color, size: number) {
        return <Node>{ key: key, data: data, color: color, size: size };
    }
    let root: Node;
    function isRed(node: Node) {
        return node && (node.color == Color.RED);
    }
    function nodeSize(node: Node) {
        return node ? node.size : 0;
    }
    function size() {
        return nodeSize(root);
    }
    function isEmpty() {
        return root;
    }
    function get(key: TKey) {
        if (key) {
            return nodeGet(root, key);
        }
    }
    function nodeGet(node: Node, key: TKey) {
        while (node) {
            let cmp = compareKeys(key, node.key);
            if (cmp < 0) {
                node = node.left;
            }
            else if (cmp > 0) {
                node = node.right;
            }
            else {
                return node;
            }
        }
    }
    function contains(key: TKey) {
        return get(key);
    }
    function put(key: TKey, data: TData, conflict?: Base.ConflictAction<TKey, TData>) {
        if (key) {
            if (data === undefined) {
                remove(key);
            }
            else {
                root = nodePut(root, key, data, conflict);
                root.color = Color.BLACK;
            }
        }
    }
    function nodePut(node: Node, key: TKey, data: TData, conflict?: Base.ConflictAction<TKey, TData>) {
        if (!node) {
            return makeNode(key, data, Color.RED, 1);
        }
        else {
            let cmp = compareKeys(key, node.key);
            if (cmp < 0) {
                node.left = nodePut(node.left, key, data, conflict);
            }
            else if (cmp > 0) {
                node.right = nodePut(node.right, key, data, conflict);
            }
            else {
                if (conflict) {
                    node.data=conflict(key, node.data, data);
                }
                else {
                    node.data = data;
                }
            }
            if (isRed(node.right) && (!isRed(node.left))) {
                node = rotateLeft(node);
            }
            if (isRed(node.left) && isRed(node.left.left)) {
                node = rotateRight(node);
            }
            if (isRed(node.left) && isRed(node.right)) {
                flipColors(node);
            }
            node.size = nodeSize(node.left) + nodeSize(node.right) + 1;

            return node;
        }
    }
    function removeMin() {
        if (!isEmpty()) {
            if ((!isRed(root.left)) && (!isRed(root.right))) {
                root.color = Color.RED;
            }

            root = nodeRemoveMin(root);
            if (!isEmpty()) {
                root.color = Color.BLACK;
            }
        }
        // TODO: error on empty
    }
    function nodeRemoveMin(node: Node) {
        if (node.left) {
            if ((!isRed(node.left)) && (!isRed(node.left.left))) {
                node = moveRedLeft(node);
            }

            node.left = nodeRemoveMin(node.left);
            return balance(node);
        }
    }

    function removeMax() {
        if (isEmpty()) {
            if ((!isRed(root.left)) && (!isRed(root.right))) {
                root.color = Color.RED;
            }

            root = nodeRemoveMax(root);
            if (!isEmpty()) {
                root.color = Color.BLACK;
            }
        }
        // TODO: error on empty
    }

    function nodeRemoveMax(node: Node) {
        if (isRed(node.left)) {
            node = rotateRight(node);
        }

        if (!node.right) {
            return undefined;
        }

        if ((!isRed(node.right)) && (!isRed(node.right.left))) {
            node = moveRedRight(node);
        }

        node.right = nodeRemoveMax(node.right);

        return balance(node);
    }

    function remove(key: TKey) {
        if (key) {
            if (!contains(key)) {
                return;
            }

            if ((!isRed(root.left)) && (!isRed(root.right))) {
                root.color = Color.RED;
            }

            root = nodeRemove(root, key);
        }
        // TODO: error on undefined key
    }

    function nodeRemove(node: Node, key: TKey) {
        if (compareKeys(key, node.key) < 0) {
            if ((!isRed(node.left)) && (!isRed(node.left.left))) {
                node = moveRedLeft(node);
            }
            node.left = nodeRemove(node.left, key);
        }
        else {
            if (isRed(node.left)) {
                node = rotateRight(node);
            }
            if ((compareKeys(key, node.key) == 0) && (!node.right)) {
                return undefined;
            }
            if ((!isRed(node.right)) && (!isRed(node.right.left))) {
                node = moveRedRight(node);
            }
            if (compareKeys(key, node.key) == 0) {
                let subtreeMin = nodeMin(node.right);
                node.key = subtreeMin.key;
                node.data = subtreeMin.data;
                node.right = nodeRemoveMin(node.right);
            }
            else {
                node.right = nodeRemove(node.right, key);
            }
        }
        return balance(node);
    }
    function height() {
        return nodeHeight(root);
    }
    function nodeHeight(node: Node) {
        if (node === undefined) {
            return -1;
        }
        else {
            return 1 + Math.max(nodeHeight(node.left), nodeHeight(node.right));
        }
    }
    function min() {
        if (!isEmpty()) {
            return nodeMin(root);
        }
        // TODO: error on empty
    }
    function nodeMin(node: Node): Node {
        if (!node.left) {
            return node;
        }
        else {
            return nodeMin(node.left);
        }
    }
    function max() {
        if (!isEmpty()) {
            return nodeMax(root);
        }
        // TODO: error on empty
    }
    function nodeMax(node: Node): Node {
        if (!node.right) {
            return node;
        }
        else {
            return nodeMax(node.right);
        }
    }
    function rotateRight(node: Node) {
        let leftChild = node.left;
        node.left = leftChild.right;
        leftChild.right = node;
        leftChild.color = leftChild.right.color;
        leftChild.right.color = Color.RED;
        leftChild.size = node.size;
        node.size = nodeSize(node.left) + nodeSize(node.right) + 1;
        return leftChild;
    }

    function rotateLeft(node: Node) {
        let rightChild = node.right;
        node.right = rightChild.left;
        rightChild.left = node;
        rightChild.color = rightChild.left.color;
        rightChild.left.color = Color.RED;
        rightChild.size = node.size;
        node.size = nodeSize(node.left) + nodeSize(node.right) + 1;
        return rightChild;
    }

    function oppositeColor(c: Color) {
        return (c == Color.BLACK) ? Color.RED : Color.BLACK;
    }

    function flipColors(node: Node) {
        node.color = oppositeColor(node.color);
        node.left.color = oppositeColor(node.left.color);
        node.right.color = oppositeColor(node.right.color);
    }

    function moveRedLeft(node: Node) {
        flipColors(node);
        if (isRed(node.right.left)) {
            node.right = rotateRight(node.right);
            node = rotateLeft(node);
            flipColors(node);
        }
        return node;
    }

    function moveRedRight(node: Node) {
        flipColors(node);
        if (isRed(node.left.left)) {
            node = rotateRight(node);
            flipColors(node);
        }
        return node;
    }

    function balance(node: Node) {
        if (isRed(node.right)) {
            node = rotateLeft(node);
        }
        if (isRed(node.left) && isRed(node.left.left)) {
            node = rotateRight(node);
        }
        if (isRed(node.left) && (isRed(node.right))) {
            flipColors(node);
        }
        node.size = nodeSize(node.left) + nodeSize(node.right) + 1;
        return node;
    }

    function mapRange(action: Base.PropertyAction<TKey, TData>, start?: TKey, end?: TKey) {
        nodeMap(root, action, start, end);
    }

    function map<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        nodeMap(root, action, accum);
    }

    function nodeMap<TAccum>(node: Node, action: Base.PropertyAction<TKey, TData>,
        accum?: TAccum, start?: TKey, end?: TKey) {
        if (!node) {
            return true;
        }
        if (start === undefined) {
            start = nodeMin(node).key;
        }
        if (end === undefined) {
            end = nodeMax(node).key;
        }
        let cmpStart = compareKeys(start, node.key);
        let cmpEnd = compareKeys(end, node.key);
        let go = true;
        if (cmpStart < 0) {
            go = nodeMap(node.left, action, accum, start, end);
        }
        if (go && (cmpStart <= 0) && (cmpEnd >= 0)) {
            go = action(node, accum);
        }
        if (go && (cmpEnd > 0)) {
            go = nodeMap(node.right, action, accum, start, end);
        }
        return go;
    }
    function diag() {
        console.log(`Height is ${height()}`);
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
