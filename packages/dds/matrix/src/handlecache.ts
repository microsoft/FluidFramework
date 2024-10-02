/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { assert } from "@fluidframework/core-utils/internal";
import { IVectorConsumer } from "@tiny-calc/nano";

import { Handle, isHandleValid } from "./handletable.js";
import { PermutationSegment, PermutationVector } from "./permutationvector.js";
import { ensureRange } from "./range.js";

/**
 * Used by PermutationVector to cache position -\> handle lookups.
 *
 * Perf: Possibly, this should eventually be inlined into PermutationVector itself, but
 * so far there's no measurable perf penalty for being a separate object (node 12 x64)
 */
export class HandleCache implements IVectorConsumer<Handle> {
	private handles: Handle[] = [];
	private start = 0;

	constructor(public readonly vector: PermutationVector) {}

	/**
	 * Returns the index of the given position in the 'handles' array as a Uint32.
	 * (If the position is not in the array, returns an integer greater than 'handles.length').
	 */
	private getIndex(position: number): number {
		return (position - this.start) >>> 0;
	}

	/**
	 * Returns the handle currently assigned to the given 'position' (if any).  Check
	 * the result with 'isValidHandle(..)' to see if a handle has been allocated for
	 * the given position.
	 *
	 * @throws A 'RangeError' if the provided 'position' is out-of-bounds with regards to the
	 * PermutationVector's length.
	 */
	public getHandle(position: number): Handle {
		const index = this.getIndex(position);

		// Perf: To encourage inlining, handling of the 'cacheMiss(..)' case has been extracted
		//       to a separate method.

		// Perf: A cache hit implies that 'position' was in bounds.  Therefore, we can defer
		//       checking that 'position' is in bounds until 'cacheMiss(..)'.  This yields an
		//       ~40% speedup when the position is in the cache (node v12 x64).

		return index < this.handles.length ? this.handles[index] : this.cacheMiss(position);
	}

	/**
	 * Update the cache when a handle has been allocated for a given position.
	 */
	public addHandle(position: number, handle: Handle): void {
		assert(isHandleValid(handle), 0x017 /* "Trying to add invalid handle!" */);

		const index = this.getIndex(position);
		if (index < this.handles.length) {
			assert(
				!isHandleValid(this.handles[index]),
				0x018 /* "Trying to insert handle into position with already valid handle!" */,
			);
			this.handles[index] = handle;
		}
	}

	/**
	 * Used by {@link HandleCache.cacheMiss} to retrieve handles for a range of positions.
	 */
	private getHandles(start: number, end: number): Handle[] {
		// TODO: This can be accelerated substantially using 'walkSegments()'.  The only catch
		//       is that

		const handles: Handle[] = [];
		const { vector } = this;

		for (let pos = start; pos < end; pos++) {
			const { segment, offset } = vector.getContainingSegment(pos);
			const asPerm = segment as PermutationSegment;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			handles.push(asPerm.start + offset!);
		}

		return handles;
	}

	private cacheMiss(position: number): Handle {
		// Coercing 'position' to an Uint32 allows us to handle a negative 'position' value
		// with the same logic that handles 'position' >= length.
		const _position = position >>> 0;

		// TODO: To bound memory usage, there should be a limit on the maximum size of
		//       handle[].

		// TODO: To reduce MergeTree lookups, this code should opportunistically grow
		//       the cache to the next MergeTree segment boundary (within the limits of
		//       the handle cache).

		if (_position < this.start) {
			this.handles = [...this.getHandles(_position, this.start), ...this.handles];
			this.start = _position;
			return this.handles[0];
		} else {
			ensureRange(_position, this.vector.getLength());

			this.handles = [
				...this.handles,
				...this.getHandles(this.start + this.handles.length, _position + 1),
			];
			return this.handles[this.handles.length - 1];
		}
	}

	// #region IVectorConsumer

	itemsChanged(start: number, removedCount: number, insertedCount: number): void {
		// If positions were inserted/removed, our current policy is to trim the array
		// at the beginning of the invalidate range and lazily repopulate the handles
		// on demand.
		//
		// Some alternatives to consider that preserve the previously cached handles
		// that are still valid:
		//
		//      * Eagerly populate the 'handles[]' with the newly insert values (currently guaranteed
		//        to be Handle.unallocated, so we don't even need to look them up.)
		//
		//      * Use a sentinel value or other mechanism to allow "holes" in the cache.

		const index = this.getIndex(start);
		if (index < this.handles.length) {
			this.handles.length = index;
		}
	}

	// #endregion IVectorConsumer
}
