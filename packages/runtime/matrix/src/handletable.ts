/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A handle table provides a fast mapping from an integer `handle` to a value `T`.
 */
export class HandleTable<T> {
    // Note: the first slot of the 'handles' array is reserved to store the pointer to the first
    //       free handle.  We initialize this slot with a pointer to slot '1', which will cause
    //       us to delay allocate the following slot in the array on the first allocation.
    private readonly handles: (number | T)[] = [1];

    public clear() {
        // Restore the HandleTable's initial state by deleting all items in the handles array
        // and then re-inserting the value '1' in the 0th slot.  (See comment at `handles` decl
        // for explanation.)
        this.handles.splice(0, this.handles.length, 1);
    }

    /**
     * Allocates and returns the next available handle.  Note that freed handles are recycled.
     */
    public allocate(): number {
        const free = this.next;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        this.next = (this.handles[free] as number) || free + 1;
        return free;
    }

    /**
     * Allocates and returns the next available `count` handles.
     */
    public allocateMany(count: number) {
        const handles = new Uint32Array(count);
        for (let i = 0; i < count; i++) {
            handles[i] = this.allocate();
        }
        return handles;
    }

    /**
     * Returns the given handle to the free list.
     */
    public free(handle: number) {
        this.handles[handle] = this.next;
        this.next = handle;
    }

    /**
     * Get the value `T` associated with the given handle, if any.
     */
    public get(handle: number): T {
        return this.handles[handle] as T;
    }

    /**
     * Set the value `T` associated with the given handle.
     */
    public set(handle: number, value: T) {
        this.handles[handle] = value;
    }

    // Private helpers to get/set the head of the free list, which is stored in the 0th slot
    // of the handle array.
    private get next() { return this.handles[0] as number; }
    private set next(handle: number) { this.handles[0] = handle; }
}
