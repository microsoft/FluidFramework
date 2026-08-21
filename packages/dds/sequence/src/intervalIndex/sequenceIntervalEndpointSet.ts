/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SortedSet } from "@fluidframework/merge-tree/internal";

import type { SequenceInterval } from "../intervals/index.js";

/**
 * A set of intervals ordered by one of their endpoints, then by interval id.
 *
 * The id is included so that the ordering is total. Without it, distinct intervals sharing an
 * endpoint would compare equal, and a set cannot store or remove entries it cannot tell apart.
 *
 * Queries, however, must not consider the id. Every query here is expressed in terms of a
 * position, and is answered by locating the boundaries of the run of intervals sharing that
 * endpoint via {@link SequenceIntervalEndpointSet.lowerBound} and
 * {@link SequenceIntervalEndpointSet.upperBound}, which compare endpoints alone. This is well
 * defined precisely because the set is ordered by endpoint first. It also means callers can probe
 * with a transient interval whose id is arbitrary, which matters because
 * `createTransientIntervalFromSequence` assigns transients a freshly generated id.
 */
abstract class SequenceIntervalEndpointSet extends SortedSet<SequenceInterval> {
	/**
	 * Orders two intervals by whichever endpoint this set is keyed on, ignoring their ids.
	 */
	protected abstract compareEndpoints(a: SequenceInterval, b: SequenceInterval): number;

	protected compare(a: SequenceInterval, b: SequenceInterval): number {
		const endpointResult = this.compareEndpoints(a, b);
		if (endpointResult !== 0) {
			return endpointResult;
		}

		const aId = a.getIntervalId();
		const bId = b.getIntervalId();
		if (aId === undefined || bId === undefined) {
			// Without ids there is nothing left to order by; `onFindEquivalent` disambiguates.
			return 0;
		}
		// Ordinal rather than locale comparison: this must never report distinct ids as equal,
		// which is a guarantee `localeCompare` does not make.
		return aId === bId ? 0 : aId < bId ? -1 : 1;
	}

	/**
	 * Reached only when `compare` cannot separate two intervals, which for intervals with ids
	 * means they are the same interval. Intervals without ids fall back to scanning the run of
	 * equal entries for this exact instance, so that they remain individually addressable rather
	 * than collapsing onto one entry.
	 */
	protected onFindEquivalent(
		item: SequenceInterval,
		index: number,
	): { exists: boolean; index: number } {
		if (item.getIntervalId() !== undefined) {
			return { exists: true, index };
		}

		let runStart = index;
		while (runStart > 0 && this.compare(item, this.sortedItems[runStart - 1]) === 0) {
			runStart--;
		}

		for (
			let i = runStart;
			i < this.sortedItems.length && this.compare(item, this.sortedItems[i]) === 0;
			i++
		) {
			if (this.sortedItems[i] === item) {
				return { exists: true, index: i };
			}
		}

		return { exists: false, index };
	}

	// #region Binary search

	/**
	 * Binary searches for the point where `matches` starts holding. It must be false for some
	 * (possibly empty) run of intervals at the front of the set and true for all the rest, which
	 * holds for any predicate keyed on the endpoint this set is ordered by.
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
	 * Binary searches on the keyed endpoint alone, ignoring ids.
	 *
	 * @returns the index of the first interval whose endpoint is not before `probe`'s.
	 */
	private lowerBound(probe: SequenceInterval): number {
		return this.firstIndexWhere((interval) => this.compareEndpoints(interval, probe) >= 0);
	}

	/**
	 * Binary searches on the keyed endpoint alone, ignoring ids.
	 *
	 * @returns the index of the first interval whose endpoint is after `probe`'s.
	 */
	private upperBound(probe: SequenceInterval): number {
		return this.firstIndexWhere((interval) => this.compareEndpoints(interval, probe) > 0);
	}

	// #endregion Binary search

	// #region Endpoint queries

	/**
	 * Finds the floor of `probe` by keyed endpoint.
	 *
	 * @returns the interval with the greatest endpoint at or before `probe`'s, if any.
	 */
	public lastAtOrBefore(probe: SequenceInterval): SequenceInterval | undefined {
		const index = this.upperBound(probe) - 1;
		return index >= 0 ? this.sortedItems[index] : undefined;
	}

	/**
	 * Finds the ceiling of `probe` by keyed endpoint.
	 *
	 * @returns the interval with the least endpoint at or after `probe`'s, if any.
	 */
	public firstAtOrAfter(probe: SequenceInterval): SequenceInterval | undefined {
		const index = this.lowerBound(probe);
		return index < this.sortedItems.length ? this.sortedItems[index] : undefined;
	}

	/**
	 * Selects the run of intervals bounded by two probe positions.
	 *
	 * @returns every interval whose keyed endpoint lies within `[low, high]`, inclusive of both
	 * bounds, in set order.
	 */
	public range(low: SequenceInterval, high: SequenceInterval): SequenceInterval[] {
		return this.sortedItems.slice(this.lowerBound(low), this.upperBound(high));
	}

	// #endregion Endpoint queries
}

/**
 * Intervals ordered by their end position. Backs both `EndpointIndex` and
 * `EndpointInRangeIndex`.
 */
export class SequenceIntervalEndSet extends SequenceIntervalEndpointSet {
	protected compareEndpoints(a: SequenceInterval, b: SequenceInterval): number {
		return a.compareEnd(b);
	}
}

/**
 * Intervals ordered by their start position. Backs `StartpointInRangeIndex`.
 */
export class SequenceIntervalStartSet extends SequenceIntervalEndpointSet {
	protected compareEndpoints(a: SequenceInterval, b: SequenceInterval): number {
		return a.compareStart(b);
	}
}
