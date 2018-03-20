import * as assert from "assert";

/**
 * Represents a numeric range
 */
export class Range {
    /**
     * Intersects two ranges
     */
    public static intersect(first: Range, second: Range): Range {
        const tail = Math.max(first.tail, second.tail);
        const head = Math.min(first.head, second.head);
        return head >= tail ? new Range(tail, head) : new Range();
    }

    /**
     * Takes the union of two ranges
     */
    public static union(first: Range, second: Range): Range {
        if (first.empty) {
            return second;
        } else if (second.empty) {
            return first;
        } else {
            return new Range(Math.min(first.tail, second.tail), Math.max(first.head, second.head));
        }
    }

    // tslint:disable-next-line:variable-name
    constructor(private _tail = Number.NEGATIVE_INFINITY, private _head = Number.NEGATIVE_INFINITY) {
        assert.ok(this._head >= this._tail);
    }

    public get head(): number {
        return this._head;
    }

    public set head(head: number) {
        assert.ok(head > this._head, `${head} > ${this._head}`);
        this._head = head;
    }

    public get tail(): number {
        return this._tail;
    }

    public set tail(tail: number) {
        assert.ok(tail > this._tail && tail <= this._head);
        this._tail = tail;
    }

    public get empty(): boolean {
        return this._head === this._tail;
    }
}
