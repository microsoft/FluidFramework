/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/container-utils";

export interface ListNode<T> {
    readonly list: List<T> | undefined;
    readonly data: T;
    readonly next: ListNode<T> | undefined;
    readonly prev: ListNode<T> | undefined;
}

export interface ListNodeRange<T> {
    first: ListNode<T>;
    last: ListNode<T>;
}

class HeadNode<T> {
    public _next: HeadNode<T> | DataNode<T> = this;
    public _prev: HeadNode<T> | DataNode<T> = this;
    public headNode: HeadNode<T> = this;
    private readonly _list?: List<T>;
    constructor(list: List<T> | undefined) {
        if (list) {
            this._list = list;
        }
    }
    public get next(): DataNode<T> | undefined {
        return this._next === this.headNode
            ? undefined
            : this._next as DataNode<T>;
    }
    public get prev(): DataNode<T> | undefined {
        return this._prev === this.headNode
            ? undefined
            : this._prev as DataNode<T>;
    }
    public get list() {
        return this.headNode._list;
    }
}

const DeadHead = new HeadNode<any>(undefined);

class DataNode<T> extends HeadNode<T> implements ListNode<T> {
    constructor(headNode: HeadNode<T>, public readonly data: T) {
        super(undefined);
        this.headNode = headNode;
    }
}

function insertAfter<T>(node: DataNode<T> | HeadNode<T>, items: T[]): ListNodeRange<T> {
    let previousNode = node;
    const oldNext = previousNode._next;
    let newRange: ListNodeRange<T> | undefined;
    items.forEach((n) => {
        const newNode = new DataNode<T>(node.headNode, n);
        if (newRange === undefined) {
            newRange = { first: newNode, last: newNode };
        } else {
            newRange.last = newNode;
        }
        newNode._prev = previousNode;
        previousNode._next = newNode;
        previousNode = newNode;
    });
    oldNext._prev = previousNode;
    previousNode._next = oldNext;
    // explicitly prevent newRange from being undefined without casting,
    // and without additional conditionals, as this is used in some perf critical areas.
    // i could have just asserted, but that throws a non-user friendly error,
    // so i went with a more user-friendly error, which describes the
    // only condition that could lead to this being undefined in the current code.
    if (newRange === undefined) {
        throw new UsageError("items must not be empty");
    }
    return newRange;
}

export class List<T> implements
    Iterable<ListNode<T>>,
    Partial<ListNodeRange<T>>,
    // try to match array signature and semantics where possible
    Pick<ListNode<T>[], "pop" | "shift" | "length" | "includes" > {
    map<U>(callbackfn: (value: ListNode<T>) => U): Iterable<U> {
        let node = this.first;
        const iterator: IterableIterator<U> = {
            next(): IteratorResult<U> {
                if (node === undefined) {
                    return { done: true, value: undefined };
                }
                const rtn = { value: callbackfn(node), done: false };
                node = node.next;
                return rtn;
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }

    insertAfter(preceding: ListNode<T>, ...items: T[]): ListNodeRange<T> {
        if (!this._includes(preceding)) {
            throw new Error("preceding not in list");
        }
        this._len += items.length;
        return insertAfter(preceding, items);
    }

    pop(): ListNode<T> | undefined {
        return this.remove(this.last);
    }

    push(...items: T[]): ListNodeRange<T> {
        this._len += items.length;
        const start = this.headNode._prev;
        return insertAfter(start, items);
    }

    shift(): ListNode<T> | undefined {
        return this.remove(this.first);
    }

    unshift(...items: T[]): ListNodeRange<T> {
        this._len += items.length;
        return insertAfter(this.headNode, items);
    }

    public includes(node: ListNode<T> | undefined): node is ListNode<T> {
        return this._includes(node);
    }

    private _includes(node: ListNode<T> | undefined): node is DataNode<T> {
        return node instanceof DataNode && node.headNode === this.headNode;
    }

    remove(node: ListNode<T> | undefined): ListNode<T> | undefined {
        if (this._includes(node)) {
            node._prev._next = node._next;
            node._next._prev = node._prev;
            node.headNode = node._next = node._prev = DeadHead;
            this._len--;
            return node;
        }
        return undefined;
    }

    public [Symbol.iterator](): IterableIterator<ListNode<T>> {
        let value = this.first;
        const iterator: IterableIterator<ListNode<T>> = {
            next(): IteratorResult<ListNode<T>> {
                if (value !== undefined) {
                    const rtn = { value, done: false };
                    value = value.next;
                    return rtn;
                }
                return { value: undefined, done: true };
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }

    private _len: number = 0;
    private readonly headNode: HeadNode<T> | DataNode<T> = new HeadNode(this);
    public get length() { return this._len; }
    public get empty() { return this._len === 0; }
    public get first(): ListNode<T> | undefined {
        return this.headNode.next;
    }

    public get last(): ListNode<T> | undefined {
        return this.headNode.prev;
    }
}

export function walkList<T>(
    list: List<T>,
    visitor: (node: ListNode<T>) => boolean | void,
    start?: ListNode<T>,
    forward: boolean = true,
) {
    let current: ListNode<T> | undefined;
    if (start) {
        if (!list.includes(start)) {
            throw new UsageError("start must be in the provided list");
        }
        current = start;
    } else {
        current = forward ? list.first : list.last;
    }

    while (current !== undefined) {
        if (visitor(current) === false) {
            return false;
        }
        current = forward ? current.next : current.prev;
    }
    return true;
}
