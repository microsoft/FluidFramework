/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * An iterator that supports having items pushed onto it for later iteration.
 */
export class StackyIterator<T> implements Iterator<T>, Iterable<T> {
    private readonly list: readonly T[];
    private readonly stack: T[] = [];
    private index = 0;

    public constructor(list: readonly T[]) {
        this.list = list;
    }

    [Symbol.iterator](): Iterator<T> {
        return this;
    }

    next(): IteratorResult<T> {
        if (this.done) {
            return { value: undefined, done: true };
        }
        return { value: this.pop() as T };
    }

    public get done(): boolean {
        return this.index >= this.list.length && this.stack.length === 0;
    }

    public push(item: T): void {
        this.stack.push(item);
    }

    public pop(): T | undefined {
        if (this.stack.length > 0) {
            return this.stack.pop();
        }
        if (this.index >= this.list.length) {
            return undefined;
        }
        return this.list[this.index++];
    }
}
