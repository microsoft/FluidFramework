/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareReferencePositions } from "@fluidframework/merge-tree/internal";

import type { BaseSequenceInterval } from "../intervals/index.js";

const compareIntervals = (a: BaseSequenceInterval, b: BaseSequenceInterval): number =>
	a.compare(b);

const compareStarts = (a: BaseSequenceInterval, b: BaseSequenceInterval): number =>
	a.compareStart(b);

const compareEndpoints = (a: BaseSequenceInterval, b: BaseSequenceInterval): number => {
	const startResult = a.compareStart(b);
	return startResult === 0 ? a.compareEnd(b) : startResult;
};

/**
 * A set of intervals that can efficiently answer "which of these intervals overlap the given
 * range?".
 *
 * The intervals are kept in an array sorted by {@link BaseSequenceInterval.compare} - by start
 * position, then end position, then interval id.
 *
 * An interval can only overlap the query if it starts at or before the query's end, so a binary
 * search narrows the search to the front of the array. Not every interval in that portion
 * overlaps, though: an interval also has to end at or after the query's start, and the ones that
 * don't are scattered throughout. Checking each of them one by one would get slower the further
 * into the document the query is, no matter how few intervals actually match.
 *
 * To avoid that, the set also maintains a segment tree over the array. Each node of that tree
 * covers a range of the array and records the greatest end position among the intervals in that
 * range. If that end position falls before the query's start, none of the intervals under the
 * node can overlap, and the query skips the whole range at once.
 *
 * Both the sort order and the segment tree hold references to intervals rather than resolved
 * positions, so they stay correct as text edits move interval endpoints around. Only adding or
 * removing an interval invalidates the segment tree, and it is rebuilt on the next query rather
 * than immediately, so a batch of changes only pays for one rebuild.
 */
export class SequenceIntervalOverlapSet {
	private readonly ordered: BaseSequenceInterval[] = [];

	/**
	 * Segment tree over {@link SequenceIntervalOverlapSet.ordered}, stored as an implicit binary
	 * tree rooted at index 1 with the children of node `n` at `2n` and `2n + 1`. Each entry is
	 * the interval with the greatest end position within that node's range.
	 */
	private readonly maxEnds: BaseSequenceInterval[] = [];
	private maxEndsStale = false;

	/**
	 * The intervals in this set, in order. Callers must not mutate the returned array.
	 */
	public get intervals(): readonly BaseSequenceInterval[] {
		return this.ordered;
	}

	public get size(): number {
		return this.ordered.length;
	}

	public isEmpty(): boolean {
		return this.ordered.length === 0;
	}

	// #region Binary search

	/**
	 * Binary searches for the point where `matches` starts holding. It must be false for some
	 * (possibly empty) run of intervals at the front of the array and true for all the rest,
	 * which holds for any predicate that only grows more true as the ordering advances.
	 * @returns the index of the first interval `matches` accepts, or this set's size if it
	 * accepts none.
	 */
	private firstIndexWhere(matches: (interval: BaseSequenceInterval) => boolean): number {
		let lo = 0;
		let hi = this.ordered.length;
		while (lo < hi) {
			const mid = lo + Math.floor((hi - lo) / 2);
			if (matches(this.ordered[mid])) {
				hi = mid;
			} else {
				lo = mid + 1;
			}
		}
		return lo;
	}

	/**
	 * Binary searches for the start of the run of intervals equal to the given one.
	 * @returns the index of the first interval not ordered before `query` by `compare`.
	 */
	private lowerBound(
		query: BaseSequenceInterval,
		compare: (a: BaseSequenceInterval, b: BaseSequenceInterval) => number,
	): number {
		return this.firstIndexWhere((interval) => compare(interval, query) >= 0);
	}

	/**
	 * Binary searches for the end of the run of intervals equal to the given one.
	 * @returns the index of the first interval ordered after `query` by `compare`.
	 */
	private upperBound(
		query: BaseSequenceInterval,
		compare: (a: BaseSequenceInterval, b: BaseSequenceInterval) => number,
	): number {
		return this.firstIndexWhere((interval) => compare(interval, query) > 0);
	}

	// #endregion Binary search

	// #region Add and remove

	/**
	 * Locates an interval already in this set.
	 * @returns the index holding `interval`, or undefined if this set does not contain it.
	 */
	private indexOf(interval: BaseSequenceInterval): number | undefined {
		const id = interval.getIntervalId();
		for (
			let i = this.lowerBound(interval, compareIntervals);
			i < this.ordered.length && compareIntervals(this.ordered[i], interval) === 0;
			i++
		) {
			const candidate = this.ordered[i];
			if (candidate === interval || candidate.getIntervalId() === id) {
				return i;
			}
		}
		return undefined;
	}

	public add(interval: BaseSequenceInterval): void {
		if (this.indexOf(interval) !== undefined) {
			return;
		}
		this.ordered.splice(this.upperBound(interval, compareIntervals), 0, interval);
		this.maxEndsStale = true;
	}

	public remove(interval: BaseSequenceInterval): void {
		const index = this.indexOf(interval);
		if (index !== undefined) {
			this.ordered.splice(index, 1);
			this.maxEndsStale = true;
		}
	}

	// #endregion Add and remove

	// #region Overlap search

	/**
	 * Populates the segment tree rooted at `node`, which covers `[lo, hi)`.
	 * @returns the interval with the greatest end position in `[lo, hi)`.
	 */
	private buildMaxEnds(node: number, lo: number, hi: number): BaseSequenceInterval {
		let maxEnd: BaseSequenceInterval;
		if (hi - lo === 1) {
			maxEnd = this.ordered[lo];
		} else {
			const mid = lo + Math.floor((hi - lo) / 2);
			const left = this.buildMaxEnds(node * 2, lo, mid);
			const right = this.buildMaxEnds(node * 2 + 1, mid, hi);
			maxEnd = compareReferencePositions(left.end, right.end) >= 0 ? left : right;
		}
		this.maxEnds[node] = maxEnd;
		return maxEnd;
	}

	private rebuildMaxEndsIfStale(): void {
		if (this.maxEndsStale) {
			// 4n is the standard safe bound for a segment tree indexed from 1 with children at
			// 2n and 2n + 1. When the interval count isn't a power of two the recursive split
			// leaves the tree unbalanced, pushing its deepest indices past 2n, and 4n is the
			// smallest simple bound that always covers them.
			this.maxEnds.length = this.ordered.length * 4;
			this.buildMaxEnds(1, 0, this.ordered.length);
			this.maxEndsStale = false;
		}
	}

	/**
	 * Collects the intervals in `[lo, hi)` overlapping `query`, skipping subtrees which start
	 * beyond `limit` or which end before `query` begins.
	 */
	private gatherOverlapping(
		query: BaseSequenceInterval,
		node: number,
		lo: number,
		hi: number,
		limit: number,
		results: BaseSequenceInterval[],
	): void {
		if (lo >= limit || compareReferencePositions(this.maxEnds[node].end, query.start) < 0) {
			return;
		}
		if (hi - lo === 1) {
			// `lo < limit` already established that this interval starts at or before the query's
			// end, and the check above that it ends at or after the query's start.
			results.push(this.ordered[lo]);
			return;
		}
		const mid = lo + Math.floor((hi - lo) / 2);
		this.gatherOverlapping(query, node * 2, lo, mid, limit, results);
		this.gatherOverlapping(query, node * 2 + 1, mid, hi, limit, results);
	}

	/**
	 * Finds the intervals overlapping the given range.
	 * @returns every interval overlapping `query`, in order. Two intervals overlap when neither
	 * ends before the other begins; interval sides are not considered, matching
	 * {@link BaseSequenceInterval.overlaps}.
	 */
	public findOverlapping(query: BaseSequenceInterval): BaseSequenceInterval[] {
		const results: BaseSequenceInterval[] = [];
		// Only intervals starting at or before the query's end can overlap it, so the first one
		// starting after it bounds the portion of the array worth descending into.
		const limit = this.firstIndexWhere(
			(interval) => compareReferencePositions(interval.start, query.end) > 0,
		);
		if (limit > 0) {
			this.rebuildMaxEndsIfStale();
			this.gatherOverlapping(query, 1, 0, this.ordered.length, limit, results);
		}
		return results;
	}

	// #endregion Overlap search

	// #region Endpoint queries

	/**
	 * Slices out the run of intervals which compare equal to the given one.
	 * @returns the intervals comparing equal to `query` under `compare`, which must order
	 * intervals consistently with (i.e. be a prefix of the keys used by) this set's own ordering
	 * so that those intervals are contiguous.
	 */
	private equalRange(
		query: BaseSequenceInterval,
		compare: (a: BaseSequenceInterval, b: BaseSequenceInterval) => number,
	): BaseSequenceInterval[] {
		return this.ordered.slice(
			this.lowerBound(query, compare),
			this.upperBound(query, compare),
		);
	}

	/**
	 * Finds the intervals starting where the given interval starts.
	 * @returns every interval whose start matches `query`'s, in order.
	 */
	public withSameStart(query: BaseSequenceInterval): BaseSequenceInterval[] {
		return this.equalRange(query, compareStarts);
	}

	/**
	 * Finds the intervals spanning exactly the same range as the given interval.
	 * @returns every interval whose start and end both match `query`'s, in order. Interval ids
	 * are not considered, so an interval created solely to describe the range being searched for
	 * will still match the intervals in this set.
	 */
	public withSameEndpoints(query: BaseSequenceInterval): BaseSequenceInterval[] {
		return this.equalRange(query, compareEndpoints);
	}

	// #endregion Endpoint queries
}
