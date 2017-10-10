// tslint:disable

import * as Base from "./base";

export class Stack<T> {
    items: T[] = [];
    push(val: T) {
        this.items.push(val);
    }

    empty() {
        return this.items.length == 0;
    }

    top(): T | undefined {
        return this.items[this.items.length - 1];
    }

    pop(): T | undefined {
        return this.items.pop();
    }

}

export function ListRemoveEntry<U>(entry: List<U>): List<U> {
    if (entry === undefined) {
        return undefined;
    }
    else if (entry.isHead) {
        return undefined;
    }
    else {
        entry.next.prev = entry.prev;
        entry.prev.next = entry.next;
    }
    return (entry);
}

export function ListMakeEntry<U>(data: U): List<U> {
    var entry: List<U> = new List<U>(false, data);
    entry.prev = entry;
    entry.next = entry;
    return entry;
}

export function ListMakeHead<U>(): List<U> {
    var entry: List<U> = new List<U>(true, undefined);
    entry.prev = entry;
    entry.next = entry;
    return entry;
}

export class List<T> {
    next: List<T>;
    prev: List<T>;

    constructor(public isHead: boolean, public data: T) {
    }

    clear() {
        if (this.isHead) {
            this.prev = this;
            this.next = this;
        }
    }

    add(data: T): List<T> {
        var entry = ListMakeEntry(data);
        this.prev.next = entry;
        entry.next = this;
        entry.prev = this.prev;
        this.prev = entry;
        return (entry);
    }

    dequeue() {
        if (!this.empty()) {
            let removedEntry = ListRemoveEntry(this.next);
            return removedEntry.data;
        }
    }

    enqueue(data: T) {
        return this.add(data);
    }

    walk(fn: (data: T, l: List<T>) => void) {
        for (var entry = this.next; !(entry.isHead); entry = entry.next) {
            fn(entry.data, entry);
        }
    }

    some(fn: (data: T, l: List<T>) => boolean, rev?: boolean) {
        for (var entry = <List<T>>this; !(entry.isHead); entry = rev ? entry.prev : entry.next) {
            if (fn(entry.data, entry)) {
                return (entry.data);
            }
        }
    }

    count(): number {
        var entry: List<T>;
        var i: number;

        entry = this.next;
        for (i = 0; !(entry.isHead); i++) {
            entry = entry.next;
        }
        return (i);
    }

    first(): T {
        if (!this.empty()) {
            return (this.next.data);
        }
    }

    last() {
        if (!this.empty()) {
            return (this.prev.data);
        }
    }

    empty(): boolean {
        return (this.next == this);
    }

    pushEntry(entry: List<T>): void {
        entry.isHead = false;
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
    }

    push(data: T): void {
        var entry = ListMakeEntry(data);
        entry.data = data;
        entry.isHead = false;
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
    }

    popEntry(head: List<T>): List<T> {
        if (this.next.isHead)
            return (undefined);
        else return (ListRemoveEntry(this.next));
    }

    insertEntry(entry: List<T>): List<T> {
        entry.isHead = false;
        this.prev.next = entry;
        entry.next = this;
        entry.prev = this.prev;
        this.prev = entry;
        return entry;
    }

    insertAfter(data: T): List<T> {
        var entry: List<T> = ListMakeEntry(data);
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
        return (entry);
    }

    insertBefore(data: T): List<T> {
        var entry = ListMakeEntry(data);
        return this.insertEntryBefore(entry);
    }

    insertEntryBefore(entry: List<T>): List<T> {
        this.prev.next = entry;
        entry.next = this;
        entry.prev = this.prev;
        this.prev = entry;
        return (entry);
    }

}

export interface Comparer<T> {
    compare(a: T, b: T): number;
    min: T;
}

export var numberComparer: Comparer<number> = {
    min: Number.MIN_VALUE,
    compare: (a, b) => a - b,
}

export class Heap<T> {
    L: T[];
    count() {
        return this.L.length - 1;
    }
    constructor(a: T[], public comp: Comparer<T>) {
        this.L = [comp.min];
        for (var i = 0, len = a.length; i < len; i++) {
            this.add(a[i]);
        }
    }
    peek() {
        return this.L[1];
    }

    get() {
        var x = this.L[1];
        this.L[1] = this.L[this.count()];
        this.L.pop();
        this.fixdown(1);
        return x;
    }

    add(x: T) {
        this.L.push(x);
        this.fixup(this.count());
    }

    private fixup(k: number) {
        while (k > 1 && (this.comp.compare(this.L[k >> 1], this.L[k]) > 0)) {
            var tmp = this.L[k >> 1];
            this.L[k >> 1] = this.L[k];
            this.L[k] = tmp;
            k = k >> 1;
        }
    }

    private fixdown(k: number) {
        while ((k << 1) <= (this.count())) {
            var j = k << 1;
            if ((j < this.count()) && (this.comp.compare(this.L[j], this.L[j + 1]) > 0)) {
                j++;
            }
            if (this.comp.compare(this.L[k], this.L[j]) <= 0) {
                break;
            }
            var tmp = this.L[k];
            this.L[k] = this.L[j];
            this.L[j] = tmp;
            k = j;
        }
    }
}

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

export const enum Color {
    RED,
    BLACK
}

export interface Node<TKey, TData> {
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

    mapRange<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey) {
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

export interface TSTNode<T> {
    c: string;
    left?: TSTNode<T>;
    mid?: TSTNode<T>;
    right?: TSTNode<T>;
    val?: T;
}

export interface TSTPrefix {
    text: string;
}

export interface ProxString<T> {
    text: string;
    invDistance: number;
    val: T;
}

export class TST<T> {
    private n = 0;
    private root: TSTNode<T>;

    constructor() {

    }

    size() {
        return this.n;
    }

    contains(key: string) {
        return this.get(key);
    }

    get(key: string) {
        let x = this.nodeGet(this.root, key, 0);
        if (x === undefined) {
            return undefined;
        }
        return x.val;
    }

    nodeGet(x: TSTNode<T>, key: string, d: number): TSTNode<T> {
        if (x === undefined) {
            return undefined;
        }
        let c = key.charAt(d);
        if (c < x.c) {
            return this.nodeGet(x.left, key, d);
        }
        else if (c > x.c) {
            return this.nodeGet(x.right, key, d);
        }
        else if (d < (key.length - 1)) {
            return this.nodeGet(x.mid, key, d + 1);
        }
        else return x;
    }

    put(key: string, val: T) {
        if (!this.contains(key)) {
            this.n++;
        }
        this.root = this.nodePut(this.root, key, val, 0);
        // console.log(`put ${key}`);
    }

    nodePut(x: TSTNode<T>, key: string, val: T, d: number) {
        let c = key.charAt(d);
        if (x === undefined) {
            x = { c };
        }
        if (c < x.c) {
            x.left = this.nodePut(x.left, key, val, d);
        }
        else if (c > x.c) {
            x.right = this.nodePut(x.right, key, val, d);
        }
        else if (d < (key.length - 1)) {
            x.mid = this.nodePut(x.mid, key, val, d + 1);
        }
        else {
            x.val = val;
        }
        return x;
    }

    neighbors(text: string, distance = 2) {
        let q = <ProxString<T>[]>[];
        this.nodeProximity(this.root, { text: "" }, 0, text, distance, q);
        q = q.filter(value => (value.text.length>0));
        return q;
    }

    keysWithPrefix(text: string) {
        let q = <string[]>[];
        let x = this.nodeGet(this.root, text, 0);
        if (x === undefined) {
            return q;
        }
        if (x.val !== undefined) {
            q.push(text);
        }
        this.collect(x.mid, { text }, q);
        return q;
    }

    collect(x: TSTNode<T>, prefix: TSTPrefix, q: string[]) {
        if (x === undefined) {
            return;
        }
        this.collect(x.left, prefix, q);
        if (x.val !== undefined) {
            q.push(prefix.text + x.c);
        }
        this.collect(x.mid, { text: prefix.text + x.c }, q);
        this.collect(x.right, prefix, q);
    }

    patternCollect(x: TSTNode<T>, prefix: TSTPrefix, d: number, pattern: string, q: string[]) {
        if (x === undefined) {
            return;
        }
        let c = pattern.charAt(d);
        if ((c === '.') || (c < x.c)) {
            this.patternCollect(x.left, prefix, d, pattern, q);
        }
        else if ((c === '.') || (c === x.c)) {
            if ((d === (pattern.length - 1)) && (x.val !== undefined)) {
                q.push(prefix.text + x.c);
            }
            else if (d < (pattern.length - 1)) {
                this.patternCollect(x.mid, { text: prefix.text + x.c },
                    d + 1, pattern, q);
            }
        }
        if ((c === '.') || (c > x.c)) {
            this.patternCollect(x.right, prefix, d, pattern, q);
        }
    }

    nodeProximity(x: TSTNode<T>, prefix: TSTPrefix, d: number,
        pattern: string, distance: number, q: ProxString<T>[]) {
        if ((x === undefined) || (distance < 0)) {
            return;
        }
        let c = pattern.charAt(d);
        if ((distance > 0) || (c < x.c)) {
            this.nodeProximity(x.left, prefix, d, pattern, distance, q);
        }
        if (x.val !== undefined) {
            let remD = distance - (pattern.length - d); 
            if (remD >= 0) {
                let invD = distance;
                if (c !== x.c) {
                    invD--;
                }
                q.push({text: prefix.text + x.c, val: x.val, invDistance: invD });
            }
        }
        let recurD = (d < (pattern.length - 1)) ? d + 1 : d;
        if (c === x.c) {
            this.nodeProximity(x.mid, { text: prefix.text + x.c }, recurD, pattern, distance, q);
        }
        else {
            this.nodeProximity(x.mid, { text: prefix.text + x.c }, recurD, pattern, distance - 1, q);
        }
        if ((distance > 0) || (c > x.c)) {
            this.nodeProximity(x.right, prefix, d, pattern, distance, q);
        }
    }

    match(pattern: string) {
        let q = <string[]>[];
        this.patternCollect(this.root, { text: "" }, 0, pattern, q);
        return q;
    }

}