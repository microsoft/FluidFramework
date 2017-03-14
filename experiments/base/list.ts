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
        if (!this.empty())
            return (this.next.data);
        else return undefined;
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

