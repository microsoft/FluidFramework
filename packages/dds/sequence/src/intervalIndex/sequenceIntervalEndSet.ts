/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SortedSet } from "@fluidframework/merge-tree/internal";

import type { SequenceInterval } from "../intervals/index.js";

/**
 * A set of intervals ordered by their end position, then by interval ID.
 *
 * The ID is included so that the ordering is total. Without it, distinct intervals sharing an
 * end position would compare equal, and a set cannot store or remove entries it cannot tell apart.
 *
 * Queries, however, must not consider the ID. Every query here is expressed in terms of a
 * position, and is answered by locating the boundaries of the run of intervals sharing that end
 * position via {@link SequenceIntervalEndSet.lowerBound} and
 * {@link SequenceIntervalEndSet.upperBound}, which compare end positions alone. This is well
 * defined precisely because the set is ordered by end position first. It also means callers can
 * probe with a transient interval whose ID is arbitrary, which matters because
 * `createTransientIntervalFromSequence` assigns transients a freshly generated ID.
 */
export class SequenceIntervalEndSet extends SortedSet<SequenceInterval> {
	protected compare(a: SequenceInterval, b: SequenceInterval): number {
		const endResult = a.compareEnd(b);
		if (endResult !== 0) {
			return endResult;
		}

		// Ordinal rather than locale comparison: this must never report distinct IDs as equal,
		// which is a guarantee `localeCompare` does not make. IDs are unique, so comparing equal
		// here means the same interval, which is exactly what `SortedSet` assumes by default.
		const aId = a.getIntervalId();
		const bId = b.getIntervalId();
		return aId === bId ? 0 : aId < bId ? -1 : 1;
	}

	// #region Binary search

	/**
	 * Binary searches for the point where `matches` starts holding. It must be false for some
	 * (possibly empty) run of intervals at the front of the set and true for all the rest, which
	 * holds for any predicate keyed on end position.
	 *
	 * @returns the index of the first interval `matches` accepts, or this set's size if it
	 * accepts none.
	 */
	private firstIndexWhere(matches: (interval: SequenceInterval) => boolean): number {
		let low = 0;
		let high = this.sortedItems.length;
		while (low < high) {
			const mid = low + Math.floor((high - low) / 2);
			if (matches(this.sortedItems[mid])) {
				high = mid;
			} else {
				low = mid + 1;
			}
		}
		return low;
	}

	/**
	 * Binary searches on end position alone, ignoring IDs.
	 *
	 * @returns the index of the first interval whose end is not before `probe`'s.
	 */
	private lowerBound(probe: SequenceInterval): number {
		return this.firstIndexWhere((interval) => interval.compareEnd(probe) >= 0);
	}

	/**
	 * Binary searches on end position alone, ignoring IDs.
	 *
	 * @returns the index of the first interval whose end is after `probe`'s.
	 */
	private upperBound(probe: SequenceInterval): number {
		return this.firstIndexWhere((interval) => interval.compareEnd(probe) > 0);
	}

	// #endregion Binary search

	// #region Endpoint queries

	/**
	 * Finds the floor of `probe` by end position.
	 *
	 * @returns the interval with the greatest end at or before `probe`'s, if any.
	 */
	public lastAtOrBefore(probe: SequenceInterval): SequenceInterval | undefined {
		const index = this.upperBound(probe) - 1;
		return index >= 0 ? this.sortedItems[index] : undefined;
	}

	/**
	 * Finds the ceiling of `probe` by end position.
	 *
	 * @returns the interval with the least end at or after `probe`'s, if any.
	 */
	public firstAtOrAfter(probe: SequenceInterval): SequenceInterval | undefined {
		const index = this.lowerBound(probe);
		return index < this.sortedItems.length ? this.sortedItems[index] : undefined;
	}

	// #endregion Endpoint queries
}
