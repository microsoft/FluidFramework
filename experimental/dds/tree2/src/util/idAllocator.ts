/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { fail } from "./utils";

/**
 * Used for allocating IDs unique to a particular instance of the allocator.
 * @alpha
 */
export interface IdAllocator<TId = number> {
	/**
	 * Allocates a block of `count` consecutive IDs and returns the first ID in the block.
	 * For convenience can be called with no parameters to allocate a single ID.
	 */
	allocate: (count?: number) => TId;
	/**
	 * @returns The next ID that will be allocated by this allocator.
	 */
	getNextId: () => TId;
}

export interface IdAllocationState {
	maxId: number;
}

/**
 * @alpha
 */
export function idAllocatorFromMaxId(maxId: number | undefined = undefined): IdAllocator {
	return idAllocatorFromState({ maxId: maxId ?? -1 });
}

export function idAllocatorFromState(state: IdAllocationState): IdAllocator {
	return {
		allocate: (c?: number) => {
			const count = c ?? 1;
			assert(count > 0, 0x5cf /* Must allocate at least one ID */);
			const id: number = state.maxId + 1;
			state.maxId += count;
			return id;
		},
		getNextId: () => state.maxId,
	};
}

export const fakeIdAllocator: IdAllocator = {
	allocate: () => fail("Should not allocate IDs"),
	getNextId: () => 0,
};
