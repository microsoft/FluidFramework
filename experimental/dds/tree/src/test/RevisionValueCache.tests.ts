/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { fail } from '../Common';
import { RevisionValueCache } from '../RevisionValueCache';

type DummyValue = number;
const dummyValue = -1;

describe('RevisionValueCache', () => {
	function closestEntry(cache: RevisionValueCache<DummyValue>, revision: number): number {
		return (cache.getClosestEntry(revision) ?? fail('No prior revision'))[0];
	}

	it('cannot be created with a negative retention window', () => {
		expect(() => new RevisionValueCache<DummyValue>(1, -1)).to.throw(
			'retentionWindowStart must be initialized >= 0'
		);
	});

	it('cannot move the retention window backwards', () => {
		const cache = new RevisionValueCache<DummyValue>(1, 0);
		expect(() => cache.updateRetentionWindow(-1)).to.throw('retention window boundary must not move backwards');
	});

	it('can find closest entry to a queried revision', () => {
		const cache = new RevisionValueCache<DummyValue>(1, 0, [[0, dummyValue]]);
		cache.cacheValue(2, dummyValue);
		expect(closestEntry(cache, 1)).to.equal(0);
		expect(closestEntry(cache, 2)).to.equal(2);
		expect(closestEntry(cache, 3)).to.equal(2);
	});

	it('evicts entries when full', () => {
		const size = 3;
		const cache = new RevisionValueCache<DummyValue>(
			size,
			size * 3 /* ensure all entries are outside of window */,
			[[0, dummyValue]]
		);

		// Fill the cache
		// Start at 1 because the initial revision is never evicted
		for (let i = 1; i <= size; i++) {
			cache.cacheValue(i, dummyValue);
		}
		for (let i = size + 1; i <= size * 2; i++) {
			cache.cacheValue(i, dummyValue);
			// Should have evicted the oldest entry
			expect(closestEntry(cache, i - size)).to.equal(0);
		}
		for (let i = size + 1; i <= size * 2; i++) {
			expect(closestEntry(cache, i)).to.equal(i);
		}
	});

	it('retains entries within the retention window', () => {
		const windowStart = 3;
		const windowEnd = windowStart + 3;
		const cache = new RevisionValueCache<DummyValue>(1, windowStart, [[0, dummyValue]]);

		// Add entries within retention window
		for (let i = windowStart; i <= windowEnd; i++) {
			cache.cacheValue(i, dummyValue);
		}
		// Add entries outside the retention window. These should not cause the in-window entries to be evicted.
		for (let i = 1; i <= windowStart; i++) {
			cache.cacheValue(i, dummyValue);
		}
		for (let i = windowStart; i <= windowEnd; i++) {
			expect(closestEntry(cache, i)).to.equal(i);
		}
		for (let i = 1; i < windowStart - 1; i++) {
			expect(closestEntry(cache, i)).to.equal(0);
		}
	});

	it('can evict entries that move out of the retention window', () => {
		const cache = new RevisionValueCache<DummyValue>(1, 0);
		cache.cacheValue(5, dummyValue);
		cache.cacheValue(1, dummyValue);
		expect(closestEntry(cache, 5)).to.equal(5);
		cache.updateRetentionWindow(6); // adds 5 to LRU, evicts 1
		cache.cacheValue(2, dummyValue); // evicts 5
		expect(closestEntry(cache, 5)).to.equal(2);
	});

	it('never evicts explicitly retained values', () => {
		const cache = new RevisionValueCache<DummyValue>(1, 3, [[0, dummyValue]]);
		cache.cacheValue(1, dummyValue);
		// Add a retained entry outside of the retention window
		cache.cacheRetainedValue(5, dummyValue); // Should not evict 1
		expect(closestEntry(cache, 1)).to.equal(1);
		expect(closestEntry(cache, 5)).to.equal(5);
		cache.cacheValue(2, dummyValue); // Evict 1
		cache.updateRetentionWindow(10); // Should not add 5, so 2 will still be in cache
		expect(closestEntry(cache, 1)).to.equal(0);
		expect(closestEntry(cache, 2)).to.equal(2);
		expect(closestEntry(cache, 5)).to.equal(5);
		cache.cacheValue(3, dummyValue); // Evict 2
		expect(closestEntry(cache, 2)).to.equal(0);
		expect(closestEntry(cache, 5)).to.equal(5);
	});

	it('can update retention window to a new range that moves > evictableSize entries', () => {
		const cacheSize = 5;
		const cache = new RevisionValueCache<DummyValue>(cacheSize, 0);
		cache.cacheRetainedValue(0, dummyValue);
		for (let i = 0; i < cacheSize * 3; i++) {
			cache.cacheValue(i, dummyValue);
		}
		for (let i = 0; i < cacheSize * 3; i++) {
			expect(closestEntry(cache, i)).to.equal(i); // All entries are cached since they are in the window.
		}
		cache.updateRetentionWindow(cacheSize * 2 + 1); // adds 2 * cache size to LRU, so [0, cacheSize] should be evicted
		for (let i = 1; i <= cacheSize; i++) {
			expect(closestEntry(cache, i)).to.equal(0);
		}
	});
});
