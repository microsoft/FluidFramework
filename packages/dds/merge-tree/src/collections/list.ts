/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @deprecated  for internal use only. public export will be removed.
 * @internal
 */
export function ListRemoveEntry<U>(entry: List<U>): List<U> | undefined {
    if (entry === undefined) {
        return undefined;
    } else if (entry.isHead) {
        return undefined;
    } else {
        entry.next.prev = entry.prev;
        entry.prev.next = entry.next;
        entry.next = deadhead;
        entry.prev = deadhead;
    }
    return (entry);
}

function ListMakeEntry<U>(data: U): List<U> {
    return new List<U>(false, data);
}

/**
 * @deprecated  for internal use only. public export will be removed.
 * @internal
 */
export function ListMakeHead<U>(): List<U> {
    return new List<U>(true, undefined);
}

/**
 * @deprecated  for internal use only. public export will be removed.
 * @internal
 */
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

    public pop?(): T | undefined {
        const removedEntry = ListRemoveEntry(this.prev);
        return removedEntry ? removedEntry.data : undefined;
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
        let node: List<T> | undefined = this.next;
        const iterator: IterableIterator<T> = {
            next(): IteratorResult<T> {
                while (node && node.isHead === false) {
                    const value = node.data;
                    node = node.next;
                    if (value !== undefined) {
                        return { value, done: false };
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

const deadhead = ListMakeHead<any>();
