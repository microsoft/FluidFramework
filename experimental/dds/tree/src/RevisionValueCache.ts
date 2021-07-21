/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from 'sorted-btree';
import LRU from 'lru-cache';
import { assert, fail } from './Common';
import { Revision } from './LogViewer';
import { compareFiniteNumbers } from './SnapshotUtilities';

/**
 * A cache of `TValue`s corresponding to `Revision`s.
 *
 * A value is kept in cache if it meets any of the following criteria:
 * - The revision is >= `retentionWindowStart`
 * - The value has been used recently, meaning getClosestEntry or cacheValue was called with its revision. Note that being returned
 * 		when a large revision was passed to getClosestEntry does not count.
 * - The value is `retained` meaning it was provided to to constructor in retainedEntries or passed to `cacheRetainedValue`
 */
export class RevisionValueCache<TValue> {
	/**
	 * A cache of entries for revisions.
	 * This is sorted to allow efficient access to the nearest preceding entry (see getClosestEntry).
	 * Contains all cached values, regardless of why they are cached (retained, LRU or window).
	 */
	private readonly sortedEntries = new BTree<Revision, TValue>(undefined, compareFiniteNumbers);

	/**
	 * Least recently used cache of evictable entries.
	 * Subset of 'sortedValues` eligible for eviction:
	 * All entries are also in `sortedValues`, and are removed from `sortedValues` when evicted from this cache.
	 */
	private readonly evictableRevisions: LRU<Revision, TValue>;

	/**
	 * Set of all revisions that should never be evicted.
	 */
	private readonly retainedRevisions = new Set<Revision>();

	public constructor(
		/**
		 * Maximum capacity for evictable cache entries (those neither marked as retained nor within the retention window).
		 */
		evictableSize: number,
		/**
		 * The first revision within the retention window. All entries with revisions >= retentionWindowStart will be retained.
		 * Must be >= 0.
		 */
		private retentionWindowStart: Revision,
		/**
		 * Optional list of entries to permanently retain.
		 */
		retainedEntries?: [Revision, TValue][]
	) {
		assert(retentionWindowStart >= 0, 'retentionWindowStart must be initialized >= 0');
		this.evictableRevisions = new LRU({
			max: evictableSize,
			noDisposeOnSet: true,
			dispose: (revision) => {
				if (revision >= this.retentionWindowStart) {
					fail('Entries in retention window should never be evicted.');
				}
				if (this.retainedRevisions.has(revision)) {
					fail('Retained entries should not be evicted');
				}
				this.sortedEntries.delete(revision);
			},
		});
		if (retainedEntries !== undefined) {
			retainedEntries.forEach(([revision, entry]) => this.cacheRetainedValue(revision, entry));
		}
	}

	/**
	 * @returns if the supplied revision is within the retention window.
	 */
	public isWithinRetentionWindow(revision: Revision): boolean {
		return revision >= this.retentionWindowStart;
	}

	/**
	 * Sets the new retention window.
	 * @param newRetentionWindowStart - defines the trailing edge (inclusive) of the new retention window.
	 */
	public updateRetentionWindow(newRetentionWindowStart: Revision): void {
		if (newRetentionWindowStart < this.retentionWindowStart) {
			fail('retention window boundary must not move backwards');
		}
		const prevRetentionWindowStart = this.retentionWindowStart;
		this.retentionWindowStart = newRetentionWindowStart;
		const oldWindowEntries: [Revision, TValue][] = [];
		this.sortedEntries.forRange(
			prevRetentionWindowStart,
			this.retentionWindowStart,
			false,
			(windowRevision, windowEntry) => {
				if (!this.retainedRevisions.has(windowRevision)) {
					// Adding to the LRU can cause eviction which in turn mutates the b-tree we are enumerating. Thus, store list of
					// old window entries separately.
					oldWindowEntries.push([windowRevision, windowEntry]);
				}
			}
		);
		oldWindowEntries.forEach(([revision, value]) => {
			this.evictableRevisions.set(revision, value);
		});
	}

	/**
	 * @returns a [cachedRevision, value] where cachedRevision <= requestedRevision, or undefined if no such revision is cached.
	 */
	public getClosestEntry(requestedRevision: Revision): [revision: Revision, value: TValue] | undefined {
		const fromLRU = this.evictableRevisions.get(requestedRevision);
		if (fromLRU !== undefined) {
			return [requestedRevision, fromLRU];
		}
		return this.sortedEntries.nextLowerPair(requestedRevision + 1) ?? undefined;
	}

	/**
	 * Caches the supplied value and guarantees it will never be evicted.
	 */
	public cacheRetainedValue(revision: Revision, value: TValue): void {
		this.retainedRevisions.add(revision);
		this.sortedEntries.set(revision, value);
	}

	/**
	 * Caches the supplied value.
	 * The cached value is subject to eviction unless it is within the retention window or was previously added
	 * via `cacheRetainedValue`.
	 * Note that if a non-retained entry starts out within the retention window and passes outside of it due to a call to
	 * updateRetentionWindow it is then subject to eviction.
	 */
	public cacheValue(revision: Revision, value: TValue): void {
		if (this.retainedRevisions.has(revision)) {
			return;
		}
		this.sortedEntries.set(revision, value);
		if (revision < this.retentionWindowStart) {
			this.evictableRevisions.set(revision, value);
		}
	}
}
