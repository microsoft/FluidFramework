/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";

/**
 * Allocates a block of `count` consecutive IDs and returns the first ID in the block.
 * For convenience can be called with no parameters to allocate a single ID.
 * @alpha
 */
export type IdAllocator = (count?: number) => number;

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
	return (c?: number) => {
		const count = c ?? 1;
		assert(count > 0, 0x5cf /* Must allocate at least one ID */);
		const id: number = state.maxId + 1;
		state.maxId += count;
		return id;
	};
}
