/* eslint-disable no-bitwise */

import { strict as assert } from "assert";
import { IVectorConsumer } from "@tiny-calc/nano";
import { Handle, isHandleValid } from "./handletable";
import { PermutationVector, PermutationSegment } from "./permutationvector";
import { ensureRange } from "./range";

/**
 *
 */
export class HandleCache implements IVectorConsumer<Handle> {
    private handles: Handle[] = [];
    private start = 0;

    constructor (public readonly vector: PermutationVector) { }

    public getHandle(position: number) {
        const index = this.getIndex(position);

        return index < this.handles.length
            ? this.handles[index]
            : this.cacheMiss(position);
    }

    private getIndex(position: number) {
        return (position - this.start) >>> 0;
    }

    public add(position: number, handle: Handle) {
        assert(isHandleValid(handle));

        const index = this.getIndex(position);
        if (index < this.handles.length) {
            this.handles[index] = handle;
        }
    }

    private getHandles(start: number, end: number) {
        const handles: Handle[] = [];
        const { vector } = this;

        for (let pos = start; pos < end; pos++) {
            const { segment, offset } = vector.getContainingSegment(pos);
            const asPerm = segment as PermutationSegment;
            handles.push(asPerm.start + offset);
        }

        return handles;
    }

    private cacheMiss(position: number) {
        // eslint-disable-next-line no-param-reassign
        position >>>= 0;

        if (position < this.start) {
            this.handles = this.getHandles(position, this.start).concat(this.handles);
            this.start = position;
            return this.handles[0];
        } else {
            ensureRange(position, this.vector.getLength());
            this.handles = this.handles.concat(this.getHandles(this.start + this.handles.length, position + 1));
            return this.handles[this.handles.length - 1];
        }
    }

    // #region IVectorConsumer

    itemsChanged(start: number, removedCount: number, insertedCount: number): void {
        this.handles = [];
        this.start = 0;
    }

    // #endregion IVectorConsumer
}
