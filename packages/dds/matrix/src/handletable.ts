/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const enum Handle {
	/**
	 * Sentinel representing the absence of a valid handle.
	 */
	none = 0,

	/**
	 * Minimum valid handle.
	 */
	valid = 1,

	/**
	 * Sentinel representing an unallocated Handle.  Used by PermutationVector
	 * to delay allocate handles when previously empty row/cols become populated.
	 */
	unallocated = -0x80000000,
}

export const isHandleValid = (handle: Handle): boolean => handle >= Handle.valid;

/**
 * A handle table provides a fast mapping from an integer `handle` to a value `T`.
 */
export class HandleTable<T> {
	// Note: the first slot of the 'handles' array is reserved to store the pointer to the first
	//       free handle.  We initialize this slot with a pointer to slot '1', which will cause
	//       us to delay allocate the following slot in the array on the first allocation.
	public constructor(private readonly handles: (Handle | T)[] = [1]) {}

	public clear(): void {
		// Restore the HandleTable's initial state by deleting all items in the handles array
		// and then re-inserting the value '1' in the 0th slot.  (See comment at `handles` decl
		// for explanation.)
		this.handles.splice(0, this.handles.length, 1);
	}

	/**
	 * Allocates and returns the next available handle.  Note that freed handles are recycled.
	 */
	public allocate(): Handle {
		// Get the handle to the next free slot.
		const free = this.next;

		// Update 'next' to point to the new head of the free list.  We use the contents of
		// recycled slots to store the free list.  The contents of the handles[free] will point
		// to the next available slot.  If there are no free slots (i.e., 'handles' is full),
		// the slot will point to 'handles.length'.  In this case, the handles array will grow
		// and we update 'next' to point to the new end of the array.
		this.next = (this.handles[free] as Handle) ?? free + 1;

		// Out of paranoia, overwrite the contents of the newly allocated free slot with an
		// invalid handle value.  This may help catch/diagnose bugs in the event the free list
		// becomes corrupted.
		this.handles[free] = Handle.none;

		return free;
	}

	/**
	 * Allocates and returns the next available `count` handles.
	 */
	public allocateMany(count: Handle): Uint32Array {
		const handles = new Uint32Array(count);
		for (let i = 0; i < count; i++) {
			handles[i] = this.allocate();
		}
		return handles;
	}

	/**
	 * Returns the given handle to the free list.
	 */
	public free(handle: Handle): void {
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
	public set(handle: Handle, value: T): void {
		this.handles[handle] = value;
	}

	// Private helpers to get/set the head of the free list, which is stored in the 0th slot
	// of the handle array.
	private get next(): Handle {
		return this.handles[0] as Handle;
	}
	private set next(handle: Handle) {
		this.handles[0] = handle;
	}

	public getSummaryContent(): (Handle | T)[] {
		return this.handles;
	}

	public static load<T>(data: (Handle | T)[]): HandleTable<T> {
		return new HandleTable<T>(data);
	}
}
