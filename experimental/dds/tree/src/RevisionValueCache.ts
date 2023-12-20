/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils';
import BTree from 'sorted-btree';
import LRU from 'lru-cache';
import { fail, compareFiniteNumbers } from './Common';

/**
 * A revision corresponds to an index in an `EditLog`.
 *
 * It is associated with the output `RevisionView` of applying the edit at the index to the previous revision.
 * For example:
 *
 * - revision 0 corresponds to the initialRevision.
 *
 * - revision 1 corresponds to the output of editLog[0] applied to the initialRevision.
 * @alpha
 */
export type Revision = number;

/**
 * A cache of `TValue`s corresponding to `Revision`s.
 *
 * A value is kept in cache if it meets any of the following criteria:
 *
 * - The revision is \>= `retentionWindowStart`
 *
 * - The value has been used recently, meaning getClosestEntry or cacheValue was called with its revision. Note that
 * being returned when a large revision was passed to getClosestEntry does not count.
 *
 * - The value is `retained` meaning it was provided to to constructor in retainedEntries or passed to
 * `cacheRetainedValue`
 */
export class RevisionValueCache<TValue> {
	/**
	 * A cache of entries for revisions.
	 * This is sorted to allow efficient access to the nearest preceding entry (see getClosestEntry).
	 * Contains all cached values, regardless of why they are cached (retained, LRU or window).
	 */
	private readonly sortedEntries = new BTree<Revision, TValue>(undefined, compareFiniteNumbers);

	/**
	 * Cache of most recently used evictable entries.
	 * Subset of `sortedValues` eligible for eviction:
	 * All entries are also in `sortedValues`, and are removed from `sortedValues` when evicted from this cache.
	 * Evicts least recently used entries.
	 */
	private readonly evictableRevisions: LRU<Revision, TValue>;

	/**
	 * The oldest revision that must be retained in memory.
	 */
	private retainedRevision?: Revision;

	public constructor(
		/**
		 * Maximum capacity for evictable cache entries (those neither marked as retained nor within the retention window).
		 */
		evictableSize: number,
		/**
		 * The first revision within the retention window. All entries with revisions \>= retentionWindowStart will be retained.
		 * Must be \>= 0.
		 */
		private retentionWindowStart: Revision,
		/**
		 * The oldest revision that must be retained in memory.
		 */
		retainedRevision?: [Revision, TValue]
	) {
		assert(retentionWindowStart >= 0, 0x62c /* retentionWindowStart must be initialized >= 0 */);
		this.evictableRevisions = new LRU({
			max: evictableSize,
			noDisposeOnSet: true,
			dispose: (revision) => {
				if (revision >= this.retentionWindowStart) {
					fail('Entries in retention window should never be evicted.');
				}
				if (this.retainedRevision === revision) {
					fail('Retained entries should not be evicted');
				}
				this.sortedEntries.delete(revision);
			},
		});

		if (retainedRevision !== undefined) {
			this.cacheRetainedValue(retainedRevision[0], retainedRevision[1]);
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
				if (this.retainedRevision !== windowRevision) {
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
	 * @returns a [cachedRevision, value] where cachedRevision \<= requestedRevision, or undefined if no such revision
	 * is cached.
	 */
	public getClosestEntry(requestedRevision: Revision): [revision: Revision, value: TValue] | undefined {
		const fromLRU = this.evictableRevisions.get(requestedRevision);
		if (fromLRU !== undefined) {
			return [requestedRevision, fromLRU];
		}
		return this.sortedEntries.getPairOrNextLower(requestedRevision) ?? undefined;
	}

	/**
	 * Caches the supplied value and guarantees it will never be evicted.
	 * This will make the previously retained value evictable.
	 */
	public cacheRetainedValue(revision: Revision, value: TValue): void {
		if (this.retainedRevision !== undefined) {
			this.sortedEntries.delete(this.retainedRevision);
		}
		this.retainedRevision = revision;
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
		if (this.retainedRevision === revision) {
			return;
		}
		this.sortedEntries.set(revision, value);
		if (revision < this.retentionWindowStart) {
			this.evictableRevisions.set(revision, value);
		}
	}
}
