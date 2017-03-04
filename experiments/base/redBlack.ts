/// <reference path="base.d.ts" />

// for testing
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

const enum Color {
    RED,
    BLACK
}

interface Node<TKey, TData> {
    key: TKey;
    data: TData;
    left: Node<TKey, TData>;
    right: Node<TKey, TData>;
    color: Color;
    size: number;
}

export class RedBlackTree<TKey, TData> implements Base.SortedDictionary<TKey, TData> {
    root: Node<TKey, TData>;
    constructor(public compareKeys: Base.KeyComparer<TKey>) {

    }
    makeNode(key: TKey, data: TData, color: Color, size: number) {
        return <Node<TKey, TData>>{ key: key, data: data, color: color, size: size };
    }
    isRed(node: Node<TKey, TData>) {
        return node && (node.color == Color.RED);
    }
    nodeSize(node: Node<TKey, TData>) {
        return node ? node.size : 0;
    }
    size() {
        return this.nodeSize(this.root);
    }
    isEmpty() {
        return this.root;
    }
    get(key: TKey) {
        if (key) {
            return this.nodeGet(this.root, key);
        }
    }
    nodeGet(node: Node<TKey, TData>, key: TKey) {
        while (node) {
            let cmp = this.compareKeys(key, node.key);
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
    contains(key: TKey) {
        return this.get(key);
    }
    put(key: TKey, data: TData, conflict?: Base.ConflictAction<TKey, TData>) {
        if (key) {
            if (data === undefined) {
                this.remove(key);
            }
            else {
                this.root = this.nodePut(this.root, key, data, conflict);
                this.root.color = Color.BLACK;
            }
        }
    }
    nodePut(node: Node<TKey, TData>, key: TKey, data: TData, conflict?: Base.ConflictAction<TKey, TData>) {
        if (!node) {
            return this.makeNode(key, data, Color.RED, 1);
        }
        else {
            let cmp = this.compareKeys(key, node.key);
            if (cmp < 0) {
                node.left = this.nodePut(node.left, key, data, conflict);
            }
            else if (cmp > 0) {
                node.right = this.nodePut(node.right, key, data, conflict);
            }
            else {
                if (conflict) {
                    node.data = conflict(key, node.data, data);
                }
                else {
                    node.data = data;
                }
            }
            if (this.isRed(node.right) && (!this.isRed(node.left))) {
                node = this.rotateLeft(node);
            }
            if (this.isRed(node.left) && this.isRed(node.left.left)) {
                node = this.rotateRight(node);
            }
            if (this.isRed(node.left) && this.isRed(node.right)) {
                this.flipColors(node);
            }
            node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;

            return node;
        }
    }
    removeMin() {
        if (!this.isEmpty()) {
            if ((!this.isRed(this.root.left)) && (!this.isRed(this.root.right))) {
                this.root.color = Color.RED;
            }

            this.root = this.nodeRemoveMin(this.root);
            if (!this.isEmpty()) {
                this.root.color = Color.BLACK;
            }
        }
        // TODO: error on empty
    }
    nodeRemoveMin(node: Node<TKey, TData>) {
        if (node.left) {
            if ((!this.isRed(node.left)) && (!this.isRed(node.left.left))) {
                node = this.moveRedLeft(node);
            }

            node.left = this.nodeRemoveMin(node.left);
            return this.balance(node);
        }
    }

    removeMax() {
        if (this.isEmpty()) {
            if ((!this.isRed(this.root.left)) && (!this.isRed(this.root.right))) {
                this.root.color = Color.RED;
            }

            this.root = this.nodeRemoveMax(this.root);
            if (!this.isEmpty()) {
                this.root.color = Color.BLACK;
            }
        }
        // TODO: error on empty
    }

    nodeRemoveMax(node: Node<TKey, TData>) {
        if (this.isRed(node.left)) {
            node = this.rotateRight(node);
        }

        if (!node.right) {
            return undefined;
        }

        if ((!this.isRed(node.right)) && (!this.isRed(node.right.left))) {
            node = this.moveRedRight(node);
        }

        node.right = this.nodeRemoveMax(node.right);

        return this.balance(node);
    }

    remove(key: TKey) {
        if (key) {
            if (!this.contains(key)) {
                return;
            }

            if ((!this.isRed(this.root.left)) && (!this.isRed(this.root.right))) {
                this.root.color = Color.RED;
            }

            this.root = this.nodeRemove(this.root, key);
        }
        // TODO: error on undefined key
    }

    nodeRemove(node: Node<TKey, TData>, key: TKey) {
        if (this.compareKeys(key, node.key) < 0) {
            if ((!this.isRed(node.left)) && (!this.isRed(node.left.left))) {
                node = this.moveRedLeft(node);
            }
            node.left = this.nodeRemove(node.left, key);
        }
        else {
            if (this.isRed(node.left)) {
                node = this.rotateRight(node);
            }
            if ((this.compareKeys(key, node.key) == 0) && (!node.right)) {
                return undefined;
            }
            if ((!this.isRed(node.right)) && (!this.isRed(node.right.left))) {
                node = this.moveRedRight(node);
            }
            if (this.compareKeys(key, node.key) == 0) {
                let subtreeMin = this.nodeMin(node.right);
                node.key = subtreeMin.key;
                node.data = subtreeMin.data;
                node.right = this.nodeRemoveMin(node.right);
            }
            else {
                node.right = this.nodeRemove(node.right, key);
            }
        }
        return this.balance(node);
    }
    height() {
        return this.nodeHeight(this.root);
    }
    nodeHeight(node: Node<TKey, TData>) {
        if (node === undefined) {
            return -1;
        }
        else {
            return 1 + Math.max(this.nodeHeight(node.left), this.nodeHeight(node.right));
        }
    }

    floor(key: TKey) {
        if (!this.isEmpty()) {
            return this.nodeFloor(this.root, key);
        }
    }

    nodeFloor(node: Node<TKey, TData>, key: TKey) {
        if (node) {
            let cmp = this.compareKeys(key, node.key);
            if (cmp == 0) {
                return node;
            }
            else if (cmp < 0) {
                return this.nodeFloor(node.left, key);
            }
            else {
                let rightFloor = this.nodeFloor(node.right, key);
                if (rightFloor) {
                    return rightFloor;
                }
                else {
                    return node;
                }
            }
        }
    }

    min() {
        if (!this.isEmpty()) {
            return this.nodeMin(this.root);
        }
        // TODO: error on empty
    }
    nodeMin(node: Node<TKey, TData>): Node<TKey, TData> {
        if (!node.left) {
            return node;
        }
        else {
            return this.nodeMin(node.left);
        }
    }
    max() {
        if (!this.isEmpty()) {
            return this.nodeMax(this.root);
        }
        // TODO: error on empty
    }
    nodeMax(node: Node<TKey, TData>): Node<TKey, TData> {
        if (!node.right) {
            return node;
        }
        else {
            return this.nodeMax(node.right);
        }
    }
    rotateRight(node: Node<TKey, TData>) {
        let leftChild = node.left;
        node.left = leftChild.right;
        leftChild.right = node;
        leftChild.color = leftChild.right.color;
        leftChild.right.color = Color.RED;
        leftChild.size = node.size;
        node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
        return leftChild;
    }

    rotateLeft(node: Node<TKey, TData>) {
        let rightChild = node.right;
        node.right = rightChild.left;
        rightChild.left = node;
        rightChild.color = rightChild.left.color;
        rightChild.left.color = Color.RED;
        rightChild.size = node.size;
        node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
        return rightChild;
    }

    oppositeColor(c: Color) {
        return (c == Color.BLACK) ? Color.RED : Color.BLACK;
    }

    flipColors(node: Node<TKey, TData>) {
        node.color = this.oppositeColor(node.color);
        node.left.color = this.oppositeColor(node.left.color);
        node.right.color = this.oppositeColor(node.right.color);
    }

    moveRedLeft(node: Node<TKey, TData>) {
        this.flipColors(node);
        if (this.isRed(node.right.left)) {
            node.right = this.rotateRight(node.right);
            node = this.rotateLeft(node);
            this.flipColors(node);
        }
        return node;
    }

    moveRedRight(node: Node<TKey, TData>) {
        this.flipColors(node);
        if (this.isRed(node.left.left)) {
            node = this.rotateRight(node);
            this.flipColors(node);
        }
        return node;
    }

    balance(node: Node<TKey, TData>) {
        if (this.isRed(node.right)) {
            node = this.rotateLeft(node);
        }
        if (this.isRed(node.left) && this.isRed(node.left.left)) {
            node = this.rotateRight(node);
        }
        if (this.isRed(node.left) && (this.isRed(node.right))) {
            this.flipColors(node);
        }
        node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
        return node;
    }

    mapRange(action: Base.PropertyAction<TKey, TData>, start?: TKey, end?: TKey) {
        this.nodeMap(this.root, action, start, end);
    }

    map<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        this.nodeMap(this.root, action, accum);
    }

    nodeMap<TAccum>(node: Node<TKey, TData>, action: Base.PropertyAction<TKey, TData>,
        accum?: TAccum, start?: TKey, end?: TKey) {
        if (!node) {
            return true;
        }
        if (start === undefined) {
            start = this.nodeMin(node).key;
        }
        if (end === undefined) {
            end = this.nodeMax(node).key;
        }
        let cmpStart = this.compareKeys(start, node.key);
        let cmpEnd = this.compareKeys(end, node.key);
        let go = true;
        if (cmpStart < 0) {
            go = this.nodeMap(node.left, action, accum, start, end);
        }
        if (go && (cmpStart <= 0) && (cmpEnd >= 0)) {
            go = action(node, accum);
        }
        if (go && (cmpEnd > 0)) {
            go = this.nodeMap(node.right, action, accum, start, end);
        }
        return go;
    }
    diag() {
        console.log(`Height is ${this.height()}`);
    }
}
