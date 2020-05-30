/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions, eqeqeq, object-shorthand */
/* eslint-disable no-bitwise, no-param-reassign, no-shadow */

import * as Base from "./base";
import * as MergeTree from "./mergeTree";

export class Stack<T> {
    items: T[] = [];
    push(val: T) {
        this.items.push(val);
    }

    empty() {
        return this.items.length === 0;
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
    const entry: List<U> = new List<U>(false, data);
    entry.prev = entry;
    entry.next = entry;
    return entry;
}

export function ListMakeHead<U>(): List<U> {
    const entry: List<U> = new List<U>(true, undefined);
    entry.prev = entry;
    entry.next = entry;
    return entry;
}

export class List<T> {
    next: List<T>;
    prev: List<T>;

    constructor(public isHead: boolean, public data: T) {
    }

    clear(): void {
        if (this.isHead) {
            this.prev = this;
            this.next = this;
        }
    }

    add(data: T): List<T> {
        const entry = ListMakeEntry(data);
        this.prev.next = entry;
        entry.next = this;
        entry.prev = this.prev;
        this.prev = entry;
        return (entry);
    }

    dequeue(): T {
        if (!this.empty()) {
            const removedEntry = ListRemoveEntry(this.next);
            return removedEntry.data;
        }
    }

    enqueue(data: T): List<T> {
        return this.add(data);
    }

    walk(fn: (data: T, l: List<T>) => void): void {
        for (let entry = this.next; !(entry.isHead); entry = entry.next) {
            fn(entry.data, entry);
        }
    }

    some(fn: (data: T, l: List<T>) => boolean, rev?: boolean): T {
        for (let entry = this as List<T>; !(entry.isHead); entry = rev ? entry.prev : entry.next) {
            if (fn(entry.data, entry)) {
                return (entry.data);
            }
        }
    }

    count(): number {
        let entry: List<T>;
        let i: number;

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

    last(): T {
        if (!this.empty()) {
            return (this.prev.data);
        }
    }

    empty(): boolean {
        return (this.next === this);
    }

    pushEntry(entry: List<T>): void {
        entry.isHead = false;
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
    }

    push(data: T): void {
        const entry = ListMakeEntry(data);
        entry.data = data;
        entry.isHead = false;
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
    }

    popEntry(head: List<T>): List<T> {
        if (this.next.isHead) {
            return (undefined);
        }
        else {
            return (ListRemoveEntry(this.next));
        }
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
        const entry: List<T> = ListMakeEntry(data);
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
        return (entry);
    }

    insertBefore(data: T): List<T> {
        const entry = ListMakeEntry(data);
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

export const numberComparer: Comparer<number> = {
    min: Number.MIN_VALUE,
    compare: (a, b) => a - b,
};

export class Heap<T> {
    L: T[];
    count() {
        return this.L.length - 1;
    }
    constructor(a: T[], public comp: Comparer<T>) {
        this.L = [comp.min];
        for (let i = 0, len = a.length; i < len; i++) {
            this.add(a[i]);
        }
    }
    peek() {
        return this.L[1];
    }

    get() {
        const x = this.L[1];
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
            const tmp = this.L[k >> 1];
            this.L[k >> 1] = this.L[k];
            this.L[k] = tmp;
            k = k >> 1;
        }
    }

    private fixdown(k: number) {
        while ((k << 1) <= (this.count())) {
            let j = k << 1;
            if ((j < this.count()) && (this.comp.compare(this.L[j], this.L[j + 1]) > 0)) {
                j++;
            }
            if (this.comp.compare(this.L[k], this.L[j]) <= 0) {
                break;
            }
            const tmp = this.L[k];
            this.L[k] = this.L[j];
            this.L[j] = tmp;
            k = j;
        }
    }
}

// For testing
export function LinearDictionary<TKey, TData>(compareKeys: Base.KeyComparer<TKey>): Base.SortedDictionary<TKey, TData> {
    const a: Base.Property<TKey, TData>[] = [];
    const compareProps = (a: Base.Property<TKey, TData>, b: Base.Property<TKey, TData>) => compareKeys(a.key, b.key);
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
                const ecmp = compareKeys(end, a[i].key);
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
        if (key !== undefined) {
            if (data === undefined) {
                remove(key);
            }
            else {
                a.push({ key, data });
                a.sort(compareProps); // Go to insertion sort if too slow
            }
        }
    }
    function remove(key: TKey) {
        if (key !== undefined) {
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
        diag: diag,
    };
}

export const enum RBColor {
    RED,
    BLACK
}

export interface RBNode<TKey, TData> {
    key: TKey;
    data: TData;
    left: RBNode<TKey, TData>;
    right: RBNode<TKey, TData>;
    color: RBColor;
    size: number;
}

export interface IRBAugmentation<TKey, TData> {
    update(node: RBNode<TKey, TData>);
    init?(node: RBNode<TKey, TData>);
}

export interface IRBMatcher<TKey, TData> {
    continueSubtree(node: RBNode<TKey, TData>, key: TKey): boolean;
    matchNode(node: RBNode<TKey, TData>, key: TKey): boolean;
}

export interface RBNodeActions<TKey, TData> {
    infix?(node: RBNode<TKey, TData>): boolean;
    pre?(node: RBNode<TKey, TData>): boolean;
    post?(node: RBNode<TKey, TData>): boolean;
    showStructure?: boolean;
}

export class RedBlackTree<TKey, TData> implements Base.SortedDictionary<TKey, TData> {
    root: RBNode<TKey, TData>;
    constructor(public compareKeys: Base.KeyComparer<TKey>, public aug?: IRBAugmentation<TKey, TData>) {

    }

    makeNode(key: TKey, data: TData, color: RBColor, size: number) {
        const node = <RBNode<TKey, TData>>{ key, data, color, size };
        if (this.aug && this.aug.init) {
            this.aug.init(node);
        }
        return node;
    }

    isRed(node: RBNode<TKey, TData>) {
        return node && (node.color == RBColor.RED);
    }

    nodeSize(node: RBNode<TKey, TData>) {
        return node ? node.size : 0;
    }
    size() {
        return this.nodeSize(this.root);
    }
    isEmpty() {
        return !this.root;
    }
    get(key: TKey) {
        if (key !== undefined) {
            return this.nodeGet(this.root, key);
        }
    }
    nodeGet(node: RBNode<TKey, TData>, key: TKey) {
        while (node) {
            const cmp = this.compareKeys(key, node.key);
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

    gather(key: TKey, matcher: IRBMatcher<TKey, TData>) {
        const results = [] as RBNode<TKey, TData>[];
        if (key !== undefined) {
            this.nodeGather(this.root, results, key, matcher);
        }
        return results;
    }

    nodeGather(
        node: RBNode<TKey, TData>,
        results: RBNode<TKey, TData>[],
        key: TKey,
        matcher: IRBMatcher<TKey, TData>) {
        if (node) {
            if (matcher.continueSubtree(node.left, key)) {
                this.nodeGather(node.left, results, key, matcher);
            }
            if (matcher.matchNode(node, key)) {
                results.push(node);
            }
            if (matcher.continueSubtree(node.right, key)) {
                this.nodeGather(node.right, results, key, matcher);
            }
        }
    }

    put(key: TKey, data: TData, conflict?: Base.ConflictAction<TKey, TData>) {
        if (key !== undefined) {
            if (data === undefined) {
                this.remove(key);
            }
            else {
                this.root = this.nodePut(this.root, key, data, conflict);
                this.root.color = RBColor.BLACK;
            }
        }
    }

    nodePut(node: RBNode<TKey, TData>, key: TKey, data: TData, conflict?: Base.ConflictAction<TKey, TData>) {
        if (!node) {
            return this.makeNode(key, data, RBColor.RED, 1);
        }
        else {
            const cmp = this.compareKeys(key, node.key);
            if (cmp < 0) {
                node.left = this.nodePut(node.left, key, data, conflict);
            }
            else if (cmp > 0) {
                node.right = this.nodePut(node.right, key, data, conflict);
            }
            else {
                if (conflict) {
                    const kd = conflict(key, node.key, data, node.data);
                    if (kd.key) {
                        node.key = kd.key;
                    }
                    if (kd.data) {
                        node.data = kd.data;
                    } else {
                        node.data = data;
                    }
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
            if (this.aug) {
                this.updateLocal(node);
            }
            return node;
        }
    }

    updateLocal(node: RBNode<TKey, TData>) {
        if (this.aug) {
            if (this.isRed(node.left)) {
                this.aug.update(node.left);
            }
            if (this.isRed(node.right)) {
                this.aug.update(node.right);
            }
            this.aug.update(node);
        }
    }

    removeMin() {
        if (!this.isEmpty()) {
            if ((!this.isRed(this.root.left)) && (!this.isRed(this.root.right))) {
                this.root.color = RBColor.RED;
            }

            this.root = this.nodeRemoveMin(this.root);
            if (!this.isEmpty()) {
                this.root.color = RBColor.BLACK;
            }
        }
        // TODO: error on empty
    }
    nodeRemoveMin(node: RBNode<TKey, TData>) {
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
                this.root.color = RBColor.RED;
            }

            this.root = this.nodeRemoveMax(this.root);
            if (!this.isEmpty()) {
                this.root.color = RBColor.BLACK;
            }
        }
        // TODO: error on empty
    }

    nodeRemoveMax(node: RBNode<TKey, TData>) {
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
        if (key !== undefined) {
            if (!this.contains(key)) {
                return;
            }

            if ((!this.isRed(this.root.left)) && (!this.isRed(this.root.right))) {
                this.root.color = RBColor.RED;
            }

            this.root = this.nodeRemove(this.root, key);
        }
        // TODO: error on undefined key
    }

    nodeRemove(node: RBNode<TKey, TData>, key: TKey) {
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
                const subtreeMin = this.nodeMin(node.right);
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
    nodeHeight(node: RBNode<TKey, TData>) {
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

    nodeFloor(node: RBNode<TKey, TData>, key: TKey): RBNode<TKey, TData> {
        if (node) {
            const cmp = this.compareKeys(key, node.key);
            if (cmp == 0) {
                return node;
            }
            else if (cmp < 0) {
                return this.nodeFloor(node.left, key);
            }
            else {
                const rightFloor = this.nodeFloor(node.right, key);
                if (rightFloor) {
                    return rightFloor;
                }
                else {
                    return node;
                }
            }
        }
    }

    ceil(key: TKey) {
        if (!this.isEmpty()) {
            return this.nodeCeil(this.root, key);
        }
    }

    nodeCeil(node: RBNode<TKey, TData>, key: TKey): RBNode<TKey, TData> {
        if (node) {
            const cmp = this.compareKeys(key, node.key);
            if (cmp == 0) {
                return node;
            }
            else if (cmp > 0) {
                return this.nodeCeil(node.right, key);
            }
            else {
                const leftCeil = this.nodeCeil(node.left, key);
                if (leftCeil) {
                    return leftCeil;
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

    nodeMin(node: RBNode<TKey, TData>): RBNode<TKey, TData> {
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

    nodeMax(node: RBNode<TKey, TData>): RBNode<TKey, TData> {
        if (!node.right) {
            return node;
        }
        else {
            return this.nodeMax(node.right);
        }
    }

    rotateRight(node: RBNode<TKey, TData>) {
        const leftChild = node.left;
        node.left = leftChild.right;
        leftChild.right = node;
        leftChild.color = leftChild.right.color;
        leftChild.right.color = RBColor.RED;
        leftChild.size = node.size;
        node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
        if (this.aug) {
            this.updateLocal(node);
            this.updateLocal(leftChild);
        }
        return leftChild;
    }

    rotateLeft(node: RBNode<TKey, TData>) {
        const rightChild = node.right;
        node.right = rightChild.left;
        rightChild.left = node;
        rightChild.color = rightChild.left.color;
        rightChild.left.color = RBColor.RED;
        rightChild.size = node.size;
        node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
        if (this.aug) {
            this.updateLocal(node);
            this.updateLocal(rightChild);
        }
        return rightChild;
    }

    oppositeColor(c: RBColor) {
        return (c == RBColor.BLACK) ? RBColor.RED : RBColor.BLACK;
    }

    flipColors(node: RBNode<TKey, TData>) {
        node.color = this.oppositeColor(node.color);
        node.left.color = this.oppositeColor(node.left.color);
        node.right.color = this.oppositeColor(node.right.color);
    }

    moveRedLeft(node: RBNode<TKey, TData>) {
        this.flipColors(node);
        if (this.isRed(node.right.left)) {
            node.right = this.rotateRight(node.right);
            node = this.rotateLeft(node);
            this.flipColors(node);
        }
        return node;
    }

    moveRedRight(node: RBNode<TKey, TData>) {
        this.flipColors(node);
        if (this.isRed(node.left.left)) {
            node = this.rotateRight(node);
            this.flipColors(node);
        }
        return node;
    }

    balance(node: RBNode<TKey, TData>) {
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
        if (this.aug) {
            this.aug.update(node);
        }
        return node;
    }

    mapRange<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey) {
        this.nodeMap(this.root, action, start, end);
    }

    map<TAccum>(action: Base.PropertyAction<TKey, TData>, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        this.nodeMap(this.root, action, accum);
    }

    keys() {
        const keyList = <TKey[]>[];
        const actions = <RBNodeActions<TKey, TData>>{
            showStructure: true,
            infix: (node) => {
                keyList.push(node.key);
                return true;
            },
        };
        this.walk(actions);
        return keyList;
    }

    /**
     * Depth-first traversal with custom action; if action returns
     * false, traversal is halted.
     * @param action - action to apply to each node
     */
    walk(actions: RBNodeActions<TKey, TData>) {
        this.nodeWalk(this.root, actions);
    }

    nodeWalk(node: RBNode<TKey, TData>, actions: RBNodeActions<TKey, TData>) {
        let go = true;
        if (node) {
            if (actions.pre) {
                if (actions.showStructure || (node.color === RBColor.BLACK)) {
                    go = actions.pre(node);
                }
            }
            if (node.left) {
                go = this.nodeWalk(node.left, actions);
            }
            if (go && actions.infix) {
                if (actions.showStructure || (node.color === RBColor.BLACK)) {
                    go = actions.infix(node);
                }
            }
            if (go) {
                go = this.nodeWalk(node.right, actions);
            }
            if (go && actions.post) {
                if (actions.showStructure || (node.color === RBColor.BLACK)) {
                    go = actions.post(node);
                }
            }
        }
        return go;
    }

    nodeMap<TAccum>(
        node: RBNode<TKey, TData>,
        action: Base.PropertyAction<TKey, TData>,
        accum?: TAccum,
        start?: TKey,
        end?: TKey) {
        if (!node) {
            return true;
        }
        if (start === undefined) {
            start = this.nodeMin(node).key;
        }
        if (end === undefined) {
            end = this.nodeMax(node).key;
        }
        const cmpStart = this.compareKeys(start, node.key);
        const cmpEnd = this.compareKeys(end, node.key);
        let go = true;
        if (cmpStart < 0) {
            go = this.nodeMap(node.left, action, accum, start, end);
        }
        if (go && (cmpStart <= 0) && (cmpEnd >= 0)) {
            // REVIEW: test for black node here
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

export interface AugIntegerRangeNode {
    minmax: Base.IIntegerRange;
}

export interface AugmentedIntervalNode {
    minmax: IInterval;
}
/**
 * Union of two ranges; assumes for both ranges start \<= end.
 * @param a - A range
 * @param b - A range
 */
export function integerRangeUnion(a: Base.IIntegerRange, b: Base.IIntegerRange) {
    return <Base.IIntegerRange>{
        start: Math.min(a.start, b.start),
        end: Math.max(a.end, b.end),
    };
}

export function integerRangeOverlaps(a: Base.IIntegerRange, b: Base.IIntegerRange) {
    return (a.start < b.end) && (a.end > b.start);
}

export function integerRangeComparer(a: Base.IIntegerRange, b: Base.IIntegerRange) {
    if (a.start === b.start) {
        return a.end - b.end;
    } else {
        return a.start - b.start;
    }
}

export const integerRangeCopy = (r: Base.IIntegerRange) => <Base.IIntegerRange>{ start: r.start, end: r.end };

export const integerRangeToString = (range: Base.IIntegerRange) => `[${range.start},${range.end})`;

export type IntegerRangeNode = RBNode<Base.IIntegerRange, AugIntegerRangeNode>;

// TODO: handle duplicate keys

export class IntegerRangeTree implements IRBAugmentation<Base.IIntegerRange, AugIntegerRangeNode>,
    IRBMatcher<Base.IIntegerRange, AugIntegerRangeNode> {
    ranges = new RedBlackTree<Base.IIntegerRange, AugIntegerRangeNode>(integerRangeComparer, this);
    diag = false;

    remove(r: Base.IIntegerRange) {
        this.ranges.remove(r);
    }

    put(r: Base.IIntegerRange) {
        this.ranges.put(r, { minmax: integerRangeCopy(r) });
    }

    toString() {
        return this.nodeToString(this.ranges.root);
    }

    nodeToString(node: IntegerRangeNode) {
        let buf = "";
        let indentAmt = 0;
        const actions = {
            pre: (node: IntegerRangeNode) => {
                let red = "";
                if (node.color === RBColor.RED) {
                    red = "R ";
                }
                buf += MergeTree.internedSpaces(indentAmt);
                // eslint-disable-next-line max-len
                buf += `${red}key: ${integerRangeToString(node.key)} minmax: ${integerRangeToString(node.data.minmax)}\n`;
                indentAmt += 2;
                return true;
            },
            post: (node: IntegerRangeNode) => {
                indentAmt -= 2;
                return true;
            },
            showStructure: true,
        };
        this.ranges.nodeWalk(node, actions);
        return buf;
    }

    matchPos(pos: number) {
        return this.match({ start: pos, end: pos + 1 });
    }

    match(r: Base.IIntegerRange) {
        return this.ranges.gather(r, this);
    }

    matchNode(node: IntegerRangeNode, key: Base.IIntegerRange) {
        return node && integerRangeOverlaps(node.key, key);
    }

    continueSubtree(node: IntegerRangeNode, key: Base.IIntegerRange) {
        const cont = node && integerRangeOverlaps(node.data.minmax, key);
        if (this.diag && (!cont)) {
            if (node) {
                console.log(`skipping subtree of size ${node.size} key ${integerRangeToString(key)}`);
                console.log(this.nodeToString(node));
            }
        }
        return cont;
    }

    update(node: IntegerRangeNode) {
        if (node.left && node.right) {
            node.data.minmax = integerRangeUnion(node.key,
                integerRangeUnion(node.left.data.minmax, node.right.data.minmax));
        } else {
            if (node.left) {
                node.data.minmax = integerRangeUnion(node.key, node.left.data.minmax);
            } else if (node.right) {
                node.data.minmax = integerRangeUnion(node.key, node.right.data.minmax);
            } else {
                node.data.minmax = integerRangeCopy(node.key);
            }
        }
    }
}

export interface IInterval {
    clone(): IInterval;
    compare(b: IInterval): number;
    overlaps(b: IInterval): boolean;
    union(b: IInterval): IInterval;
}

export const intervalComparer = (a: IInterval, b: IInterval) => a.compare(b);
export type IntervalNode<T extends IInterval> = RBNode<T, AugmentedIntervalNode>;
export type IntervalConflictResolver<TInterval> = (a: TInterval, b: TInterval) => TInterval;

export class IntervalTree<T extends IInterval> implements IRBAugmentation<T, AugmentedIntervalNode>,
    IRBMatcher<T, AugmentedIntervalNode> {
    intervals = new RedBlackTree<T, AugmentedIntervalNode>(intervalComparer, this);
    diag = false;
    timePut = false;
    putTime = 0;
    putCount = 0;

    printTiming() {
        console.log(`put total = ${this.putTime} avg=${(this.putTime / this.putCount).toFixed(2)}`);
    }

    remove(x: T) {
        this.intervals.remove(x);
    }

    put(x: T, conflict?: IntervalConflictResolver<T>) {
        let rbConflict: Base.ConflictAction<T, AugmentedIntervalNode>;
        if (conflict) {
            rbConflict = (key: T, currentKey: T) => {
                const ival = conflict(key, currentKey);
                return {
                    key: ival,
                };
            };
        }
        if (this.timePut) {
            const clockStart = MergeTree.clock();
            this.intervals.put(x, { minmax: x.clone() }, rbConflict);
            this.putTime += MergeTree.elapsedMicroseconds(clockStart);
            this.putCount++;
        } else {
            this.intervals.put(x, { minmax: x.clone() }, rbConflict);
        }
    }

    map(fn: (x: T) => void) {
        const actions = <RBNodeActions<T, AugmentedIntervalNode>>{
            infix: (node) => {
                fn(node.key);
                return true;
            },
            showStructure: true,
        };
        this.intervals.walk(actions);
    }

    // TODO: toString()
    match(x: T) {
        return this.intervals.gather(x, this);
    }

    matchNode(node: IntervalNode<T>, key: T) {
        return node && node.key.overlaps(key);
    }

    continueSubtree(node: IntervalNode<T>, key: T) {
        const cont = node && node.data.minmax.overlaps(key);
        if (this.diag && (!cont)) {
            if (node) {
                console.log(`skipping subtree of size ${node.size} key ${key.toString()}`);
                // console.log(this.nodeToString(node));
            }
        }
        return cont;
    }

    update(node: IntervalNode<T>) {
        if (node.left && node.right) {
            node.data.minmax = node.key.union(
                node.left.data.minmax.union(node.right.data.minmax));
        } else {
            if (node.left) {
                node.data.minmax = node.key.union(node.left.data.minmax);
            } else if (node.right) {
                node.data.minmax = node.key.union(node.right.data.minmax);
            } else {
                node.data.minmax = node.key.clone();
            }
        }
    }
}

export interface TSTResult<T> {
    key: string;
    val: T;
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
        const x = this.nodeGet(this.root, key, 0);
        if (x === undefined) {
            return undefined;
        }
        return x.val;
    }

    nodeGet(x: TSTNode<T>, key: string, d: number): TSTNode<T> {
        if (x === undefined) {
            return undefined;
        }
        const c = key.charAt(d);
        if (c < x.c) {
            return this.nodeGet(x.left, key, d);
        }
        else if (c > x.c) {
            return this.nodeGet(x.right, key, d);
        }
        else if (d < (key.length - 1)) {
            return this.nodeGet(x.mid, key, d + 1);
        }
        else { return x; }
    }

    put(key: string, val: T) {
        if (!this.contains(key)) {
            this.n++;
        }
        this.root = this.nodePut(this.root, key, val, 0);
        // console.log(`put ${key}`);
    }

    nodePut(x: TSTNode<T>, key: string, val: T, d: number) {
        const c = key.charAt(d);
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
        q = q.filter((value) => (value.text.length > 0));
        return q;
    }

    keysWithPrefix(text: string) {
        const q = <string[]>[];
        const x = this.nodeGet(this.root, text, 0);
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

    mapNode(x: TSTNode<T>, prefix: TSTPrefix, fn: (key: string, val: T) => void) {
        if (x === undefined) {
            return;
        }
        const key = prefix.text + x.c;
        this.mapNode(x.left, prefix, fn);
        if (x.val) {
            fn(key, x.val);
        }
        this.mapNode(x.mid, { text: key }, fn);
        this.mapNode(x.right, prefix, fn);
    }

    map(fn: (key: string, val: T) => void) {
        this.mapNode(this.root, { text: "" }, fn);
    }

    pairsWithPrefix(text: string) {
        const q = <TSTResult<T>[]>[];
        const x = this.nodeGet(this.root, text, 0);
        if (x === undefined) {
            return q;
        }
        if (x.val !== undefined) {
            q.push({ key: text, val: x.val });
        }
        this.collectPairs(x.mid, { text }, q);
        return q;
    }

    collectPairs(x: TSTNode<T>, prefix: TSTPrefix, q: TSTResult<T>[]) {
        if (x === undefined) {
            return;
        }
        this.collectPairs(x.left, prefix, q);
        if (x.val !== undefined) {
            q.push({ key: prefix.text + x.c, val: x.val });
        }
        this.collectPairs(x.mid, { text: prefix.text + x.c }, q);
        this.collectPairs(x.right, prefix, q);
    }

    patternCollect(x: TSTNode<T>, prefix: TSTPrefix, d: number, pattern: string, q: string[]) {
        if (x === undefined) {
            return;
        }
        const c = pattern.charAt(d);
        if ((c === ".") || (c < x.c)) {
            this.patternCollect(x.left, prefix, d, pattern, q);
        }
        else if ((c === ".") || (c === x.c)) {
            if ((d === (pattern.length - 1)) && (x.val !== undefined)) {
                q.push(prefix.text + x.c);
            }
            else if (d < (pattern.length - 1)) {
                this.patternCollect(x.mid, { text: prefix.text + x.c },
                    d + 1, pattern, q);
            }
        }
        if ((c === ".") || (c > x.c)) {
            this.patternCollect(x.right, prefix, d, pattern, q);
        }
    }

    nodeProximity(
        x: TSTNode<T>,
        prefix: TSTPrefix,
        d: number,
        pattern: string,
        distance: number,
        q: ProxString<T>[]) {
        if ((x === undefined) || (distance < 0)) {
            return;
        }
        const c = pattern.charAt(d);
        if ((distance > 0) || (c < x.c)) {
            this.nodeProximity(x.left, prefix, d, pattern, distance, q);
        }
        if (x.val !== undefined) {
            const remD = distance - (pattern.length - d);
            if (remD >= 0) {
                let invD = distance;
                if (c !== x.c) {
                    invD--;
                }
                q.push({ text: prefix.text + x.c, val: x.val, invDistance: invD });
            }
        }
        const recurD = (d < (pattern.length - 1)) ? d + 1 : d;
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
        const q = <string[]>[];
        this.patternCollect(this.root, { text: "" }, 0, pattern, q);
        return q;
    }
}
