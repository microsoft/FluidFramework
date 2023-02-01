/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const enum Handle {
	/** Minimum valid handle. */
	valid = 1,

	/** Sentinel representing an unallocated Handle. */
	unallocated = -0x80000000,
}

export const isHandleValid = (handle: Handle) => handle >= Handle.valid;

/**
 * A handle table provides a fast mapping from an integer `handle` to a value `T`.
 */
export class HandleTable<T> {
	// Note: the first slot of the 'handles' array is reserved to store the pointer to the first
	//       free handle.  We initialize this slot with a pointer to slot '1', which will cause
	//       us to delay allocate the following slot in the array on the first allocation.
	public constructor(private readonly handles: (Handle | T)[] = [1]) {}

	public clear() {
		// Restore the HandleTable's initial state by deleting all items in the handles array
		// and then re-inserting the value '1' in the 0th slot.  (See comment at `handles` decl
		// for explanation.)
		this.handles.splice(0, this.handles.length, 1);
	}

	/**
	 * Allocates and returns the next available handle.  Note that freed handles are recycled.
	 */
	public allocate(): Handle {
		const free = this.next;
		this.next = (this.handles[free] as Handle) ?? free + 1;
		this.handles[free] = 0;
		return free;
	}

	/**
	 * Allocates and returns the next available `count` handles.
	 */
	public allocateMany(count: Handle) {
		const handles = new Uint32Array(count);
		for (let i = 0; i < count; i++) {
			handles[i] = this.allocate();
		}
		return handles;
	}

	/**
	 * Returns the given handle to the free list.
	 */
	public free(handle: Handle) {
		this.handles[handle] = this.next;
		this.next = handle;
	}

	/**
	 * Get the value `T` associated with the given handle, if any.
	 */
	public get(handle: Handle): T {
		return this.handles[handle] as T;
	}

	/**
	 * Set the value `T` associated with the given handle.
	 */
	public set(handle: Handle, value: T) {
		this.handles[handle] = value;
	}

	// Private helpers to get/set the head of the free list, which is stored in the 0th slot
	// of the handle array.
	private get next() {
		return this.handles[0] as Handle;
	}
	private set next(handle: Handle) {
		this.handles[0] = handle;
	}

	public getSummaryContent() {
		return this.handles;
	}

	public static load<T>(data: (Handle | T)[]) {
		return new HandleTable<T>(data);
	}
}
