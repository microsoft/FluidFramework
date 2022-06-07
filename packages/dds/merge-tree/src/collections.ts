/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */

/* Remove once strictNullCheck is enabled */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    ConflictAction,
    IIntegerRange,
    KeyComparer,
    PropertyAction,
    SortedDictionary,
} from "./base";

export class Stack<T> {
    public items: T[] = [];
    public push(val: T) {
        this.items.push(val);
    }

    public empty() {
        return this.items.length === 0;
    }

    public top(): T | undefined {
        return this.items[this.items.length - 1];
    }

    public pop(): T | undefined {
        return this.items.pop();
    }
}

export function ListRemoveEntry<U>(entry: List<U>): List<U> | undefined {
    if (entry === undefined) {
        return undefined;
    } else if (entry.isHead) {
        return undefined;
    } else {
        entry.next.prev = entry.prev;
        entry.prev.next = entry.next;
    }
    return (entry);
}

function ListMakeEntry<U>(data: U): List<U> {
    return new List<U>(false, data);
}

export function ListMakeHead<U>(): List<U> {
    return new List<U>(true, undefined);
}

export class List<T> {
    public next: List<T>;
    public prev: List<T>;

    constructor(public isHead: boolean, public data: T | undefined) {
        this.prev = this;
        this.next = this;
    }

    public clear(): void {
        if (this.isHead) {
            this.prev = this;
            this.next = this;
        }
    }

    private add(data: T): List<T> {
        const entry = ListMakeEntry(data);
        this.prev.next = entry;
        entry.next = this;
        entry.prev = this.prev;
        this.prev = entry;
        return (entry);
    }

    public dequeue(): T | undefined {
        if (!this.empty()) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const removedEntry = ListRemoveEntry(this.next)!;
            return removedEntry.data;
        }
    }

    public enqueue(data: T): List<T> {
        return this.add(data);
    }

    public walk(fn: (data: T, l: List<T>) => void): void {
        for (let entry = this.next; !(entry.isHead); entry = entry.next) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            fn(entry.data!, entry);
        }
    }

    public some(fn: (data: T, l: List<T>) => boolean, rev?: boolean): T[] {
        const rtn: T[] = [];
        const start = rev ? this.prev : this.next;
        for (let entry = start; !(entry.isHead); entry = rev ? entry.prev : entry.next) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const data = entry.data!;
            if (fn(data, entry)) {
                if (rev) {
                    // preserve list order when in reverse
                    rtn.unshift(data);
                } else {
                    rtn.push(data);
                }
            }
        }
        return rtn;
    }

    public count(): number {
        let entry: List<T>;
        let i: number;

        entry = this.next;
        for (i = 0; !(entry.isHead); i++) {
            entry = entry.next;
        }
        return (i);
    }

    public first(): T | undefined {
        if (!this.empty()) {
            return (this.next.data);
        }
    }

    public last(): T | undefined {
        if (!this.empty()) {
            return (this.prev.data);
        }
    }

    public empty(): boolean {
        return (this.next === this);
    }

    /**
     * @deprecated - use unshift
     */
    public push(data: T): void {
        this.unshift(data);
    }

    public unshift(data: T): void {
        const entry = ListMakeEntry(data);
        entry.data = data;
        entry.isHead = false;
        entry.next = this.next;
        entry.prev = this;
        this.next = entry;
        entry.next.prev = entry;
    }

    public [Symbol.iterator]() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let node: List<T> | undefined = this;
        const iterator: IterableIterator<T> = {
            next(): IteratorResult<T> {
                while (node && node.next.isHead === false) {
                    node = node.next;
                    if (node.data !== undefined) {
                        return { value: node.data, done: false };
                    }
                }
                return { value: undefined, done: true };
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }
}

export interface Comparer<T> {
    compare(a: T, b: T): number;
    min: T;
}

export class Heap<T> {
    private L: T[];
    public count() {
        return this.L.length - 1;
    }
    constructor(a: T[], public comp: Comparer<T>) {
        this.L = [comp.min];
        for (let i = 0, len = a.length; i < len; i++) {
            this.add(a[i]);
        }
    }
    public peek() {
        return this.L[1];
    }

    public get() {
        const x = this.L[1];
        this.L[1] = this.L[this.count()];
        this.L.pop();
        this.fixDown(1);
        return x;
    }

    public add(x: T) {
        this.L.push(x);
        this.fixup(this.count());
    }

    /* eslint-disable no-bitwise */
    private fixup(k: number) {
        let _k = k;
        while (_k > 1 && (this.comp.compare(this.L[_k >> 1], this.L[_k]) > 0)) {
            const tmp = this.L[_k >> 1];
            this.L[_k >> 1] = this.L[_k];
            this.L[_k] = tmp;
            _k = _k >> 1;
        }
    }

    private fixDown(k: number) {
        let _k = k;
        while ((_k << 1) <= (this.count())) {
            let j = _k << 1;
            if ((j < this.count()) && (this.comp.compare(this.L[j], this.L[j + 1]) > 0)) {
                j++;
            }
            if (this.comp.compare(this.L[_k], this.L[j]) <= 0) {
                break;
            }
            const tmp = this.L[_k];
            this.L[_k] = this.L[j];
            this.L[j] = tmp;
            _k = j;
        }
    }
    /* eslint-enable no-bitwise */
}

export const RBColor = {
    RED: 0,
    BLACK: 1,
} as const;
export type RBColor = typeof RBColor[keyof typeof RBColor];

export interface RBNode<TKey, TData> {
    key: TKey;
    data: TData;
    left: RBNode<TKey, TData> | undefined;
    right: RBNode<TKey, TData> | undefined;
    color: RBColor;
    size: number;
}

export interface IRBAugmentation<TKey, TData> {
    update(node: RBNode<TKey, TData>): void;
}

export interface IRBMatcher<TKey, TData> {
    continueSubtree(node: RBNode<TKey, TData> | undefined, key: TKey): boolean;
    matchNode(node: RBNode<TKey, TData> | undefined, key: TKey): boolean;
}

export interface RBNodeActions<TKey, TData> {
    infix?(node: RBNode<TKey, TData>): boolean;
    pre?(node: RBNode<TKey, TData>): boolean;
    post?(node: RBNode<TKey, TData>): boolean;
    showStructure?: boolean;
}

export class RedBlackTree<TKey, TData> implements SortedDictionary<TKey, TData> {
    private root: RBNode<TKey, TData> | undefined;

    constructor(
        private readonly compareKeys: KeyComparer<TKey>,
        private readonly aug?: IRBAugmentation<TKey, TData>,
    ) { }

    private makeNode(key: TKey, data: TData, color: RBColor, size: number) {
        return <RBNode<TKey, TData>>{ key, data, color, size };
    }

    private isRed(node: RBNode<TKey, TData> | undefined) {
        return !!node && (node.color === RBColor.RED);
    }

    private nodeSize(node: RBNode<TKey, TData> | undefined) {
        return node ? node.size : 0;
    }
    public size() {
        return this.nodeSize(this.root);
    }
    public isEmpty() {
        return !this.root;
    }
    public get(key: TKey) {
        if (key !== undefined) {
            return this.nodeGet(this.root, key);
        }
    }
    private nodeGet(node: RBNode<TKey, TData> | undefined, key: TKey) {
        let _node = node;
        while (_node) {
            const cmp = this.compareKeys(key, _node.key);
            if (cmp < 0) {
                _node = _node.left;
            } else if (cmp > 0) {
                _node = _node.right;
            } else {
                return _node;
            }
        }
    }
    private contains(key: TKey) {
        return this.get(key);
    }

    public gather(key: TKey, matcher: IRBMatcher<TKey, TData>) {
        const results = [] as RBNode<TKey, TData>[];
        if (key !== undefined) {
            this.nodeGather(this.root, results, key, matcher);
        }
        return results;
    }

    private nodeGather(
        node: RBNode<TKey, TData> | undefined,
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

    public walkExactMatchesForward(
        compareFn: (node: RBNode<TKey, TData>) => number,
        actionFn: (node: RBNode<TKey, TData>) => void,
        continueLeftFn: (number: number) => boolean,
        continueRightFn: (number: number) => boolean) {
        this.nodeWalkExactMatchesForward(this.root, compareFn, actionFn, continueLeftFn, continueRightFn);
    }

    private nodeWalkExactMatchesForward(
        node: RBNode<TKey, TData> | undefined,
        compareFn: (node: RBNode<TKey, TData>) => number,
        actionFn: (node: RBNode<TKey, TData>) => void,
        continueLeftFn: (number: number) => boolean,
        continueRightFn: (number: number) => boolean) {
        if (!node) {
            return;
        }
        const result: number = compareFn(node);
        if (continueLeftFn(result)) {
            this.nodeWalkExactMatchesForward(node.left, compareFn, actionFn, continueLeftFn, continueRightFn);
        }
        if (result === 0) {
            actionFn(node);
        }
        if (continueRightFn(result)) {
            this.nodeWalkExactMatchesForward(node.right, compareFn, actionFn, continueLeftFn, continueRightFn);
        }
    }

    public walkExactMatchesBackward(
        compareFn: (node: RBNode<TKey, TData>) => number,
        actionFn: (node: RBNode<TKey, TData>) => void,
        continueLeftFn: (number: number) => boolean,
        continueRightFn: (number: number) => boolean) {
        this.nodeWalkExactMatchesBackward(this.root, compareFn, actionFn, continueLeftFn, continueRightFn);
    }

    private nodeWalkExactMatchesBackward(
        node: RBNode<TKey, TData> | undefined,
        compareFn: (node: RBNode<TKey, TData>) => number,
        actionFn: (node: RBNode<TKey, TData>) => void,
        continueLeftFn: (cmp: number) => boolean,
        continueRightFn: (cmp: number) => boolean) {
        if (!node) {
            return;
        }
        const result: number = compareFn(node);
        if (continueRightFn(result)) {
            this.nodeWalkExactMatchesBackward(node.right, compareFn, actionFn, continueLeftFn, continueRightFn);
        }
        if (result === 0) {
            actionFn(node);
        }
        if (continueLeftFn(result)) {
            this.nodeWalkExactMatchesBackward(node.left, compareFn, actionFn, continueLeftFn, continueRightFn);
        }
    }

    public put(key: TKey, data: TData, conflict?: ConflictAction<TKey, TData>) {
        if (key !== undefined) {
            if (data === undefined) {
                this.remove(key);
            } else {
                this.root = this.nodePut(this.root, key, data, conflict);
                this.root.color = RBColor.BLACK;
            }
        }
    }

    private nodePut(
        node: RBNode<TKey, TData> | undefined,
        key: TKey, data: TData,
        conflict?: ConflictAction<TKey, TData>,
    ) {
        let _node = node;
        if (!_node) {
            return this.makeNode(key, data, RBColor.RED, 1);
        } else {
            const cmp = this.compareKeys(key, _node.key);
            if (cmp < 0) {
                _node.left = this.nodePut(_node.left, key, data, conflict);
            } else if (cmp > 0) {
                _node.right = this.nodePut(_node.right, key, data, conflict);
            } else {
                if (conflict) {
                    const kd = conflict(key, _node.key, data, _node.data);
                    if (kd.key) {
                        _node.key = kd.key;
                    }
                    if (kd.data) {
                        _node.data = kd.data;
                    } else {
                        _node.data = data;
                    }
                } else {
                    _node.data = data;
                }
            }
            if (this.isRed(_node.right) && (!this.isRed(_node.left))) {
                _node = this.rotateLeft(_node);
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (this.isRed(_node.left) && this.isRed(_node.left!.left)) {
                _node = this.rotateRight(_node);
            }
            if (this.isRed(_node.left) && this.isRed(_node.right)) {
                this.flipColors(_node);
            }
            _node.size = this.nodeSize(_node.left) + this.nodeSize(_node.right) + 1;
            if (this.aug) {
                this.updateLocal(_node);
            }
            return _node;
        }
    }

    private updateLocal(node: RBNode<TKey, TData>) {
        if (this.aug) {
            if (this.isRed(node.left)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.aug.update(node.left!);
            }
            if (this.isRed(node.right)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.aug.update(node.right!);
            }
            this.aug.update(node);
        }
    }

    private nodeRemoveMin(node: RBNode<TKey, TData>) {
        let _node = node;
        if (_node.left) {
            if ((!this.isRed(_node.left)) && (!this.isRed(_node.left.left))) {
                _node = this.moveRedLeft(_node);
            }

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            _node.left = this.nodeRemoveMin(_node.left!);
            return this.balance(_node);
        }
    }

    public remove(key: TKey) {
        if (key !== undefined) {
            if (!this.contains(key)) {
                return;
            }

            this.removeExisting(key);
        }
        // TODO: error on undefined key
    }

    public removeExisting(key: TKey) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if ((!this.isRed(this.root!.left)) && (!this.isRed(this.root!.right))) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.root!.color = RBColor.RED;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.root = this.nodeRemove(this.root!, key);
    }

    private nodeRemove(node: RBNode<TKey, TData>, key: TKey) {
        let _node = node;
        if (this.compareKeys(key, _node.key) < 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if ((!this.isRed(_node.left)) && (!this.isRed(_node.left!.left))) {
                _node = this.moveRedLeft(_node);
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            _node.left = this.nodeRemove(_node.left!, key);
        } else {
            if (this.isRed(_node.left)) {
                _node = this.rotateRight(_node);
            }
            if ((this.compareKeys(key, _node.key) === 0) && (!_node.right)) {
                return undefined;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if ((!this.isRed(_node.right)) && (!this.isRed(_node.right!.left))) {
                _node = this.moveRedRight(_node);
            }
            if (this.compareKeys(key, _node.key) === 0) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const subtreeMin = this.nodeMin(_node.right!);
                _node.key = subtreeMin.key;
                _node.data = subtreeMin.data;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                _node.right = this.nodeRemoveMin(_node.right!);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                _node.right = this.nodeRemove(_node.right!, key);
            }
        }
        return this.balance(_node);
    }

    public floor(key: TKey) {
        if (!this.isEmpty()) {
            return this.nodeFloor(this.root, key);
        }
    }

    private nodeFloor(node: RBNode<TKey, TData> | undefined, key: TKey): RBNode<TKey, TData> | undefined {
        if (node) {
            const cmp = this.compareKeys(key, node.key);
            if (cmp === 0) {
                return node;
            } else if (cmp < 0) {
                return this.nodeFloor(node.left, key);
            } else {
                const rightFloor = this.nodeFloor(node.right, key);
                if (rightFloor) {
                    return rightFloor;
                } else {
                    return node;
                }
            }
        }
    }

    public ceil(key: TKey) {
        if (!this.isEmpty()) {
            return this.nodeCeil(this.root, key);
        }
    }

    private nodeCeil(node: RBNode<TKey, TData> | undefined, key: TKey): RBNode<TKey, TData> | undefined {
        if (node) {
            const cmp = this.compareKeys(key, node.key);
            if (cmp === 0) {
                return node;
            } else if (cmp > 0) {
                return this.nodeCeil(node.right, key);
            } else {
                const leftCeil = this.nodeCeil(node.left, key);
                if (leftCeil) {
                    return leftCeil;
                } else {
                    return node;
                }
            }
        }
    }

    public min() {
        if (this.root) {
            return this.nodeMin(this.root);
        }
    }

    private nodeMin(node: RBNode<TKey, TData>): RBNode<TKey, TData> {
        if (!node.left) {
            return node;
        } else {
            return this.nodeMin(node.left);
        }
    }

    public max() {
        if (this.root) {
            return this.nodeMax(this.root);
        }
    }

    private nodeMax(node: RBNode<TKey, TData>): RBNode<TKey, TData> {
        if (!node.right) {
            return node;
        } else {
            return this.nodeMax(node.right);
        }
    }

    private rotateRight(node: RBNode<TKey, TData>) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const leftChild = node.left!;
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

    private rotateLeft(node: RBNode<TKey, TData>) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const rightChild = node.right!;
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

    private oppositeColor(c: RBColor) {
        return (c === RBColor.BLACK) ? RBColor.RED : RBColor.BLACK;
    }

    private flipColors(node: RBNode<TKey, TData>) {
        node.color = this.oppositeColor(node.color);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        node.left!.color = this.oppositeColor(node.left!.color);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        node.right!.color = this.oppositeColor(node.right!.color);
    }

    private moveRedLeft(node: RBNode<TKey, TData>) {
        let _node = node;
        this.flipColors(_node);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (this.isRed(_node.right!.left)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            _node.right = this.rotateRight(_node.right!);
            _node = this.rotateLeft(_node);
            this.flipColors(_node);
        }
        return _node;
    }

    private moveRedRight(node: RBNode<TKey, TData>) {
        let _node = node;
        this.flipColors(_node);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (this.isRed(_node.left!.left)) {
            _node = this.rotateRight(_node);
            this.flipColors(_node);
        }
        return _node;
    }

    private balance(input: RBNode<TKey, TData>) {
        let node: RBNode<TKey, TData> | undefined = input;
        if (this.isRed(node.right)) {
            node = this.rotateLeft(node);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (this.isRed(node.left) && this.isRed(node.left!.left)) {
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

    public mapRange<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey) {
        this.nodeMap(this.root, action, start, end);
    }

    public map<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum) {
        // TODO: optimize to avoid comparisons
        this.nodeMap(this.root, action, accum);
    }

    public keys() {
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
    public walk(actions: RBNodeActions<TKey, TData>) {
        this.nodeWalk(this.root, actions);
    }

    public walkBackward(actions: RBNodeActions<TKey, TData>) {
        this.nodeWalkBackward(this.root, actions);
    }

    private nodeWalk(node: RBNode<TKey, TData> | undefined, actions: RBNodeActions<TKey, TData>): boolean {
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

    private nodeWalkBackward(node: RBNode<TKey, TData> | undefined, actions: RBNodeActions<TKey, TData>): boolean {
        let go = true;
        if (node) {
            if (actions.pre) {
                if (actions.showStructure || (node.color === RBColor.BLACK)) {
                    go = actions.pre(node);
                }
            }
            if (node.right) {
                go = this.nodeWalkBackward(node.right, actions);
            }
            if (go && actions.infix) {
                if (actions.showStructure || (node.color === RBColor.BLACK)) {
                    go = actions.infix(node);
                }
            }
            if (go) {
                go = this.nodeWalkBackward(node.left, actions);
            }
            if (go && actions.post) {
                if (actions.showStructure || (node.color === RBColor.BLACK)) {
                    go = actions.post(node);
                }
            }
        }
        return go;
    }

    private nodeMap<TAccum>(
        node: RBNode<TKey, TData> | undefined,
        action: PropertyAction<TKey, TData>,
        accum?: TAccum,
        start?: TKey,
        end?: TKey,
    ): boolean {
        let _start = start;
        let _end = end;
        if (!node) {
            return true;
        }
        if (_start === undefined) {
            _start = this.nodeMin(node).key;
        }
        if (_end === undefined) {
            _end = this.nodeMax(node).key;
        }
        const cmpStart = this.compareKeys(_start, node.key);
        const cmpEnd = this.compareKeys(_end, node.key);
        let go = true;
        if (cmpStart < 0) {
            go = this.nodeMap(node.left, action, accum, _start, _end);
        }
        if (go && (cmpStart <= 0) && (cmpEnd >= 0)) {
            // REVIEW: test for black node here
            go = action(node, accum);
        }
        if (go && (cmpEnd > 0)) {
            go = this.nodeMap(node.right, action, accum, _start, _end);
        }
        return go;
    }
}

export interface AugmentedIntervalNode {
    minmax: IInterval;
}

export const integerRangeToString = (range: IIntegerRange) => `[${range.start},${range.end})`;

export interface IInterval {
    clone(): IInterval;
    compare(b: IInterval): number;
    compareStart(b: IInterval): number;
    compareEnd(b: IInterval): number;
    modify(label: string, start: number, end: number, op?: ISequencedDocumentMessage): IInterval | undefined;
    overlaps(b: IInterval): boolean;
    union(b: IInterval): IInterval;
}

const intervalComparer = (a: IInterval, b: IInterval) => a.compare(b);
export type IntervalNode<T extends IInterval> = RBNode<T, AugmentedIntervalNode>;
export type IntervalConflictResolver<TInterval> = (a: TInterval, b: TInterval) => TInterval;

export class IntervalTree<T extends IInterval> implements IRBAugmentation<T, AugmentedIntervalNode>,
    IRBMatcher<T, AugmentedIntervalNode> {
    public intervals = new RedBlackTree<T, AugmentedIntervalNode>(intervalComparer, this);

    public remove(x: T) {
        this.intervals.remove(x);
    }

    public removeExisting(x: T) {
        this.intervals.removeExisting(x);
    }

    public put(x: T, conflict?: IntervalConflictResolver<T>) {
        let rbConflict: ConflictAction<T, AugmentedIntervalNode> | undefined;
        if (conflict) {
            rbConflict = (key: T, currentKey: T) => {
                const ival = conflict(key, currentKey);
                return {
                    key: ival,
                };
            };
        }
        this.intervals.put(x, { minmax: x.clone() }, rbConflict);
    }

    public map(fn: (x: T) => void) {
        const actions = <RBNodeActions<T, AugmentedIntervalNode>>{
            infix: (node) => {
                fn(node.key);
                return true;
            },
            showStructure: true,
        };
        this.intervals.walk(actions);
    }

    public mapUntil(fn: (X: T) => boolean) {
        const actions = <RBNodeActions<T, AugmentedIntervalNode>>{
            infix: (node) => {
                return fn(node.key);
            },
            showStructure: true,
        };
        this.intervals.walk(actions);
    }

    public mapBackward(fn: (x: T) => void) {
        const actions = <RBNodeActions<T, AugmentedIntervalNode>>{
            infix: (node) => {
                fn(node.key);
                return true;
            },
            showStructure: true,
        };
        this.intervals.walkBackward(actions);
    }

    // TODO: toString()
    public match(x: T) {
        return this.intervals.gather(x, this);
    }

    public matchNode(node: IntervalNode<T> | undefined, key: T) {
        return !!node && node.key.overlaps(key);
    }

    public continueSubtree(node: IntervalNode<T> | undefined, key: T) {
        return !!node && node.data.minmax.overlaps(key);
    }

    public update(node: IntervalNode<T>) {
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

interface TSTPrefix {
    text: string;
}

export interface ProxString<T> {
    text: string;
    invDistance: number;
    val: T;
}

export class TST<T> {
    private n = 0;
    private root: TSTNode<T> | undefined;

    public size() {
        return this.n;
    }

    private contains(key: string) {
        return this.get(key);
    }

    public get(key: string) {
        const x = this.nodeGet(this.root, key, 0);
        if (x === undefined) {
            return undefined;
        }
        return x.val;
    }

    private nodeGet(x: TSTNode<T> | undefined, key: string, d: number): TSTNode<T> | undefined {
        if (x === undefined) {
            return undefined;
        }
        const c = key.charAt(d);
        if (c < x.c) {
            return this.nodeGet(x.left, key, d);
        } else if (c > x.c) {
            return this.nodeGet(x.right, key, d);
        } else if (d < (key.length - 1)) {
            return this.nodeGet(x.mid, key, d + 1);
        } else { return x; }
    }

    public put(key: string, val: T) {
        if (!this.contains(key)) {
            this.n++;
        }
        this.root = this.nodePut(this.root, key, val, 0);
    }

    private nodePut(x: TSTNode<T> | undefined, key: string, val: T, d: number) {
        let _x = x;
        const c = key.charAt(d);
        if (_x === undefined) {
            _x = { c };
        }
        if (c < _x.c) {
            _x.left = this.nodePut(_x.left, key, val, d);
        } else if (c > _x.c) {
            _x.right = this.nodePut(_x.right, key, val, d);
        } else if (d < (key.length - 1)) {
            _x.mid = this.nodePut(_x.mid, key, val, d + 1);
        } else {
            _x.val = val;
        }
        return _x;
    }

    public neighbors(text: string, distance = 2) {
        let q = <ProxString<T>[]>[];
        this.nodeProximity(this.root, { text: "" }, 0, text, distance, q);
        q = q.filter((value) => (value.text.length > 0));
        return q;
    }

    public keysWithPrefix(text: string) {
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

    private collect(x: TSTNode<T> | undefined, prefix: TSTPrefix, q: string[]) {
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

    private mapNode(x: TSTNode<T> | undefined, prefix: TSTPrefix, fn: (key: string, val: T) => void) {
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

    public map(fn: (key: string, val: T) => void) {
        this.mapNode(this.root, { text: "" }, fn);
    }

    public pairsWithPrefix(text: string) {
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

    private collectPairs(x: TSTNode<T> | undefined, prefix: TSTPrefix, q: TSTResult<T>[]) {
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

    private nodeProximity(
        x: TSTNode<T> | undefined,
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
        } else {
            this.nodeProximity(x.mid, { text: prefix.text + x.c }, recurD, pattern, distance - 1, q);
        }
        if ((distance > 0) || (c > x.c)) {
            this.nodeProximity(x.right, prefix, d, pattern, distance, q);
        }
    }
}
