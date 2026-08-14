/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SortedSet } from "@fluidframework/merge-tree/internal";

import type { SequenceInterval } from "../intervals/index.js";
import { createTransientIntervalFromSequence } from "../intervals/index.js";
import type { ISharedSegmentSequence } from "../sequence.js";
import type { ISharedString } from "../sharedString.js";

import type { SequenceIntervalIndex } from "./intervalIndex.js";

/**
 * @internal
 */
export interface IEndpointIndex extends SequenceIntervalIndex {
	/**
	 * @returns the previous interval based on the given position number.
	 * If no such interval exists in this index, returns `undefined`
	 */
	previousInterval(pos: number): SequenceInterval | undefined;

	/**
	 * @returns the next interval based on the given position number.
	 * If no such interval exists in this index, returns `undefined`
	 */
	nextInterval(pos: number): SequenceInterval | undefined;
}

/**
 * Intervals ordered by end position, then by interval id.
 *
 * The id is included so that ordering is total: without it, distinct intervals sharing
 * an end position would compare equal and could not be stored or removed individually.
 *
 * Queries, however, must not consider the id. `previousInterval`/`nextInterval` probe
 * with a transient interval that carries a meaningful end position but a freshly
 * generated id, so ordering a probe by id would place it arbitrarily among the intervals
 * sharing its end position. Probing therefore uses {@link SequenceIntervalEndSet.compareEnds}
 * and locates run boundaries explicitly, which is well defined because the set is
 * ordered by end position first.
 */
class SequenceIntervalEndSet extends SortedSet<SequenceInterval> {
	private compareEnds(a: SequenceInterval, b: SequenceInterval): number {
		return a.compareEnd(b);
	}

	protected compare(a: SequenceInterval, b: SequenceInterval): number {
		const endResult = this.compareEnds(a, b);
		if (endResult !== 0) {
			return endResult;
		}

		const aId = a.getIntervalId();
		const bId = b.getIntervalId();
		if (aId === undefined || bId === undefined) {
			// Without ids there is nothing left to order by; `onFindEquivalent` disambiguates.
			return 0;
		}
		return aId === bId ? 0 : aId < bId ? -1 : 1;
	}

	/**
	 * Reached only when `compare` cannot separate two intervals, which for intervals with
	 * ids means they are the same interval. Intervals without ids fall back to scanning the
	 * run of equal entries for this exact instance, so that they remain individually
	 * addressable rather than collapsing onto one entry.
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

	/**
	 * Binary searches on end position alone, ignoring id.
	 *
	 * @returns the index of the first interval whose end is not before `probe`'s end.
	 */
	private lowerBound(probe: SequenceInterval): number {
		let low = 0;
		let high = this.sortedItems.length;
		while (low < high) {
			const mid = low + Math.floor((high - low) / 2);
			if (this.compareEnds(this.sortedItems[mid], probe) < 0) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	}

	/**
	 * Binary searches on end position alone, ignoring id.
	 *
	 * @returns the index of the first interval whose end is after `probe`'s end.
	 */
	private upperBound(probe: SequenceInterval): number {
		let low = 0;
		let high = this.sortedItems.length;
		while (low < high) {
			const mid = low + Math.floor((high - low) / 2);
			if (this.compareEnds(this.sortedItems[mid], probe) <= 0) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	}

	/**
	 * Finds the floor of `probe` by end position.
	 *
	 * @returns the interval with the greatest end at or before `probe`'s end, if any.
	 */
	public lastAtOrBefore(probe: SequenceInterval): SequenceInterval | undefined {
		const index = this.upperBound(probe) - 1;
		return index >= 0 ? this.sortedItems[index] : undefined;
	}

	/**
	 * Finds the ceiling of `probe` by end position.
	 *
	 * @returns the interval with the least end at or after `probe`'s end, if any.
	 */
	public firstAtOrAfter(probe: SequenceInterval): SequenceInterval | undefined {
		const index = this.lowerBound(probe);
		return index < this.sortedItems.length ? this.sortedItems[index] : undefined;
	}
}

export class EndpointIndex implements IEndpointIndex {
	private readonly endIntervals = new SequenceIntervalEndSet();

	constructor(private readonly sequence: ISharedSegmentSequence<any>) {}

	public previousInterval(pos: number): SequenceInterval | undefined {
		const transientInterval = createTransientIntervalFromSequence(pos, pos, this.sequence);
		return this.endIntervals.lastAtOrBefore(transientInterval);
	}

	public nextInterval(pos: number): SequenceInterval | undefined {
		const transientInterval = createTransientIntervalFromSequence(pos, pos, this.sequence);
		return this.endIntervals.firstAtOrAfter(transientInterval);
	}

	public add(interval: SequenceInterval): void {
		this.endIntervals.addOrUpdate(interval);
	}

	public remove(interval: SequenceInterval): void {
		this.endIntervals.remove(interval);
	}
}

/**
 * Creates an endpoint index for the provided SharedString.
 *
 * @internal
 */
export function createEndpointIndex(sharedString: ISharedString): IEndpointIndex {
	return new EndpointIndex(sharedString);
}
