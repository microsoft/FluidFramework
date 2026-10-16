/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { compareReferencePositions } from "@fluidframework/merge-tree/internal";

import type { SequenceInterval } from "../intervals/index.js";

const compareIntervals = (a: SequenceInterval, b: SequenceInterval): number => a.compare(b);

const compareStarts = (a: SequenceInterval, b: SequenceInterval): number => a.compareStart(b);

const compareEnds = (a: SequenceInterval, b: SequenceInterval): number => a.compareEnd(b);

const compareEndpoints = (a: SequenceInterval, b: SequenceInterval): number => {
	const startResult = a.compareStart(b);
	return startResult === 0 ? a.compareEnd(b) : startResult;
};

/** Stands in for an index where none is valid, marking the segment tree as owing a rebuild. */
const STALE = -1;

/**
 * Intervals sorted by (start, end, interval ID), with a max-end segment tree used to prune
 * overlap searches. Neither records a resolved position - the order is over reference positions,
 * and the tree over indices into that order - and edits preserve the relative order of reference
 * positions, so neither needs rebuilding when the text changes. Adding or removing does
 * invalidate the tree; the next overlap query rebuilds it.
 */
export class SequenceIntervalOverlapSet {
	private readonly ordered: SequenceInterval[] = [];

	/**
	 * Implicit segment tree over `ordered`: root 1, children of `n` at `2n` and `2n + 1`. Each
	 * node holds the *index* of the interval with the greatest end position in its range. Indices
	 * rather than intervals so that a stale entry cannot keep a removed interval alive, which in
	 * turn lets a mutation mark the tree rather than discard it.
	 *
	 * A negative root means a rebuild is owed, so the root has to exist from the start for a set
	 * which has never been queried to read as stale.
	 */
	private readonly maxEnds: number[] = [STALE, STALE];

	public get intervals(): readonly SequenceInterval[] {
		return this.ordered;
	}

	public isEmpty(): boolean {
		return this.ordered.length === 0;
	}

	// #region Binary search

	/**
	 * Requires `matches` to be false over a prefix and true thereafter. Returns the first
	 * matching index, or this set's size when nothing matches.
	 */
	private firstIndexWhere(matches: (interval: SequenceInterval) => boolean): number {
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

	private lowerBound(
		query: SequenceInterval,
		compare: (a: SequenceInterval, b: SequenceInterval) => number,
	): number {
		return this.firstIndexWhere((interval) => compare(interval, query) >= 0);
	}

	private upperBound(
		query: SequenceInterval,
		compare: (a: SequenceInterval, b: SequenceInterval) => number,
	): number {
		return this.firstIndexWhere((interval) => compare(interval, query) > 0);
	}

	// #endregion Binary search

	// #region Add and remove

	/**
	 * Returns the interval's index if present, or its insertion point if not. Matches on
	 * endpoints and ID rather than object identity, since callers may pass a second instance of
	 * an interval this set already holds.
	 */
	private locate(interval: SequenceInterval): { index: number; exists: boolean } {
		const index = this.lowerBound(interval, compareIntervals);
		const candidate = this.ordered[index];
		return {
			index,
			exists:
				candidate !== undefined &&
				compareIntervals(candidate, interval) === 0 &&
				candidate.getIntervalId() === interval.getIntervalId(),
		};
	}

	public add(interval: SequenceInterval): void {
		const { index, exists } = this.locate(interval);
		if (exists) {
			return;
		}
		this.ordered.splice(index, 0, interval);
		this.discardMaxEnds();
	}

	public remove(interval: SequenceInterval): void {
		const { index, exists } = this.locate(interval);
		if (exists) {
			this.ordered.splice(index, 1);
			this.discardMaxEnds();
		}
	}

	// #endregion Add and remove

	// #region Overlap search

	/**
	 * Marks the segment tree as owing a rebuild. The nodes are left in place: they are indices, so
	 * they hold nothing alive, and retaining the array means a rebuild at the same size reuses it
	 * rather than reallocating.
	 *
	 * A set which has been emptied gives the array up, since nothing will query it and so nothing
	 * will rebuild over it - `detachIndex` empties an index one interval at a time, so this is a
	 * path the API drives itself. It keeps the two entries the root sentinel needs, there being
	 * nothing to gain by trimming below the index written next.
	 */
	private discardMaxEnds(): void {
		if (this.ordered.length === 0) {
			this.maxEnds.length = 2;
		}
		this.maxEnds[1] = STALE;
	}

	/** Builds node `node`, covering `[lo, hi)`, and returns the index of its greatest end. */
	private buildMaxEnds(node: number, lo: number, hi: number): number {
		let maxEnd: number;
		if (hi - lo === 1) {
			maxEnd = lo;
		} else {
			const mid = lo + Math.floor((hi - lo) / 2);
			const left = this.buildMaxEnds(node * 2, lo, mid);
			const right = this.buildMaxEnds(node * 2 + 1, mid, hi);
			maxEnd =
				compareReferencePositions(this.ordered[left].end, this.ordered[right].end) >= 0
					? left
					: right;
		}
		this.maxEnds[node] = maxEnd;
		return maxEnd;
	}

	private rebuildMaxEndsIfStale(): void {
		if (this.maxEnds[1] === STALE) {
			// 4n bounds the node indices this layout reaches for any leaf count. Assigning the
			// length it already has is a no-op, so a rebuild at an unchanged size allocates
			// nothing.
			this.maxEnds.length = this.ordered.length * 4;
			this.buildMaxEnds(1, 0, this.ordered.length);
		}
	}

	/**
	 * Collects intervals overlapping `query` from node `node`, covering `[lo, hi)`. `limit` is
	 * the first index whose start is after `query`'s end, so ranges beginning at or after it
	 * cannot overlap and are skipped, as are subtrees whose greatest end precedes `query`.
	 */
	private gatherOverlapping(
		query: SequenceInterval,
		node: number,
		lo: number,
		hi: number,
		limit: number,
		results: SequenceInterval[],
	): void {
		if (
			lo >= limit ||
			compareReferencePositions(this.ordered[this.maxEnds[node]].end, query.start) < 0
		) {
			return;
		}
		if (hi - lo === 1) {
			results.push(this.ordered[lo]);
			return;
		}
		const mid = lo + Math.floor((hi - lo) / 2);
		this.gatherOverlapping(query, node * 2, lo, mid, limit, results);
		this.gatherOverlapping(query, node * 2 + 1, mid, hi, limit, results);
	}

	/**
	 * Returns the overlapping intervals in set order. Touching endpoints count as overlapping and
	 * interval sides are ignored, matching {@link SequenceInterval.overlaps}.
	 */
	public findOverlapping(query: SequenceInterval): SequenceInterval[] {
		const results: SequenceInterval[] = [];
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
	 * Returns the run of intervals comparing equal to `query`. `compare` must agree with this
	 * set's ordering - comparing a leading prefix of its keys does - so that both bound
	 * predicates stay monotone and the run is contiguous.
	 */
	private equalRange(
		query: SequenceInterval,
		compare: (a: SequenceInterval, b: SequenceInterval) => number,
	): SequenceInterval[] {
		return this.ordered.slice(
			this.lowerBound(query, compare),
			this.upperBound(query, compare),
		);
	}

	public withSameStart(query: SequenceInterval): SequenceInterval[] {
		return this.equalRange(query, compareStarts);
	}

	public withSameEndpoints(query: SequenceInterval): SequenceInterval[] {
		return this.equalRange(query, compareEndpoints);
	}

	/**
	 * Unlike its siblings this scans every interval, because the set is ordered by start and so
	 * intervals sharing an end are not contiguous.
	 */
	public withSameEnd(query: SequenceInterval): SequenceInterval[] {
		return this.ordered.filter((interval) => compareEnds(interval, query) === 0);
	}

	// #endregion Endpoint queries
}
