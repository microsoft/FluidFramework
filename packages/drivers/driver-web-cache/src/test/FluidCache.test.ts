/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ICacheEntry } from "@fluidframework/driver-definitions/internal";
import { getKeyForCacheEntry } from "@fluidframework/driver-utils/internal";
import { openDB } from "idb";

import { FluidCache } from "../FluidCache.js";
import {
	FluidDriverCacheDBName,
	FluidDriverObjectStoreName,
	getFluidCacheIndexedDbInstance,
} from "../FluidCacheIndexedDb.js";

const mockPartitionKey = "FAKEPARTITIONKEY";

class DateMock {
	// The current time being used by the mock
	public static mockTimeMs: number = 0;

	public static now(): number {
		return DateMock.mockTimeMs;
	}

	public getTime(): number {
		return DateMock.mockTimeMs;
	}
}

// Sets up a mock date time for the current test. Returns a function that should be called to reset the environment
function setupDateMock(startMockTime: number): () => void {
	const realDate = window.Date;
	DateMock.mockTimeMs = startMockTime;
	(window.Date as unknown) = DateMock;

	return () => (window.Date = realDate);
}

// Gets a mock cache entry from an item key, all entries returned will be for the same document.
function getMockCacheEntry(itemKey: string, options?: { docId: string }): ICacheEntry {
	return {
		file: {
			docId: options?.docId ?? "myDocument",
			resolvedUrl: {
				type: "fluid",
				url: "https://bing.com/myDocument",
				id: "mockContainer",
				tokens: {},
				endpoints: {},
			},
		},
		type: "snapshot",
		key: itemKey,
	};
}

for (const immediateClose of [true, false]) {
	function getFluidCache(config?: {
		maxCacheItemAge?: number;

		partitionKey?: string | null;
	}): FluidCache {
		return new FluidCache({
			partitionKey: config?.partitionKey ?? mockPartitionKey,
			maxCacheItemAge: config?.maxCacheItemAge ?? 3 * 24 * 60 * 60 * 1000,
			closeDbAfterMs: immediateClose ? 0 : 100,
		});
	}
	describe(`Fluid Cache tests: immediateClose: ${immediateClose}`, () => {
		let fluidCache: FluidCache;
		const extraCaches: FluidCache[] = [];

		beforeEach(() => {
			// Reset the indexed db before each test so that it starts off in an empty state
			// eslint-disable-next-line import-x/no-internal-modules, @typescript-eslint/no-require-imports
			const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
			(window.indexedDB as unknown) = new FDBFactory();
		});

		afterEach(() => {
			for (const cache of [fluidCache, ...extraCaches.splice(0)]) {
				if (cache !== undefined) {
					// eslint-disable-next-line @typescript-eslint/dot-notation -- Access to private property for testing purposes
					clearTimeout(cache["dbCloseTimer"]);
					// eslint-disable-next-line @typescript-eslint/dot-notation -- Access to private property for testing purposes
					cache["db"]?.close();
				}
			}
		});

		it("returns undefined when there is nothing in the cache", async () => {
			fluidCache = getFluidCache();

			const result = await fluidCache.get(getMockCacheEntry("shouldNotExist"));
			assert.strictEqual(result, undefined);
		});

		it("returns an item put in the cache", async () => {
			fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("shouldExist");
			const cachedItem = { foo: "bar" };

			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			assert.deepEqual(result, cachedItem);
		});

		it("returns an item put in the cache when max ops has not passed", async () => {
			fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("stillGood");
			const cachedItem = { foo: "bar" };

			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			assert.deepEqual(result, cachedItem);
		});

		it("does not return an item from the cache that is older than maxCacheItemAge", async () => {
			const clearTimeMock = setupDateMock(100);

			fluidCache = getFluidCache({ maxCacheItemAge: 5000 });

			const cacheEntry = getMockCacheEntry("tooOld");
			const cachedItem = { foo: "bar" };

			await fluidCache.put(cacheEntry, cachedItem);

			assert.deepEqual(await fluidCache.get(cacheEntry), cachedItem);

			DateMock.mockTimeMs += 5050;

			const result = await fluidCache.get(cacheEntry);
			assert.strictEqual(result, undefined);

			clearTimeMock();
		});

		it("does not return items from the cache when the partition keys do not match", async () => {
			fluidCache = getFluidCache({ partitionKey: "partitionKey1" });

			const cacheEntry = getMockCacheEntry("partitionKey1Data");
			const cachedItem = { foo: "bar" };
			await fluidCache.put(cacheEntry, cachedItem);

			assert.deepEqual(await fluidCache.get(cacheEntry), cachedItem);

			// We should not return the data from partition 1 when in partition 2
			const partition2FluidCache = getFluidCache({
				partitionKey: "partitionKey2",
			});
			extraCaches.push(partition2FluidCache);
			assert.strictEqual(await partition2FluidCache.get(cacheEntry), undefined);
		});

		it("returns values from cache when partition key is null", async () => {
			fluidCache = getFluidCache({ partitionKey: null });

			const cacheEntry = getMockCacheEntry("partitionKey1Data");
			const cachedItem = { foo: "bar" };
			await fluidCache.put(cacheEntry, cachedItem);

			assert.deepEqual(await fluidCache.get(cacheEntry), cachedItem);
		});

		it("implements the removeAllEntriesForDocId API", async () => {
			fluidCache = getFluidCache();

			const docId1Entry1 = getMockCacheEntry("docId1Entry1", {
				docId: "docId1",
			});
			const docId2Entry1 = getMockCacheEntry("docId2Entry1", {
				docId: "docId2",
			});
			const docId1Entry2 = getMockCacheEntry("docId1Entry2", {
				docId: "docId1",
			});

			await fluidCache.put(docId1Entry1, {});
			await fluidCache.put(docId2Entry1, {});
			await fluidCache.put(docId1Entry2, {});

			assert.notStrictEqual(await fluidCache.get(docId1Entry1), undefined);
			assert.notStrictEqual(await fluidCache.get(docId2Entry1), undefined);
			assert.notStrictEqual(await fluidCache.get(docId1Entry2), undefined);

			await fluidCache.removeEntries(docId1Entry1.file);

			assert.strictEqual(await fluidCache.get(docId1Entry1), undefined);
			assert.notStrictEqual(await fluidCache.get(docId2Entry1), undefined);
			assert.strictEqual(await fluidCache.get(docId1Entry2), undefined);
		});

		it("removes a specific entry without affecting other entries for the same document", async () => {
			fluidCache = getFluidCache();

			const docId1Entry1 = getMockCacheEntry("docId1Entry1", {
				docId: "docId1",
			});
			const docId1Entry2 = getMockCacheEntry("docId1Entry2", {
				docId: "docId1",
			});
			const docId2Entry1 = getMockCacheEntry("docId2Entry1", {
				docId: "docId2",
			});

			await fluidCache.put(docId1Entry1, { data: "entry1" });
			await fluidCache.put(docId1Entry2, { data: "entry2" });
			await fluidCache.put(docId2Entry1, { data: "entry3" });

			// Verify all entries exist
			assert.deepEqual(await fluidCache.get(docId1Entry1), { data: "entry1" });
			assert.deepEqual(await fluidCache.get(docId1Entry2), { data: "entry2" });
			assert.deepEqual(await fluidCache.get(docId2Entry1), { data: "entry3" });

			// Remove only one specific entry from docId1
			await fluidCache.removeEntry(docId1Entry1);

			// Verify only the specified entry was removed
			assert.strictEqual(await fluidCache.get(docId1Entry1), undefined);
			assert.deepEqual(await fluidCache.get(docId1Entry2), { data: "entry2" }); // Still exists
			assert.deepEqual(await fluidCache.get(docId2Entry1), { data: "entry3" }); // Still exists
		});

		// The tests above test the public API of Fluid Cache.
		//  Those tests should not break if we changed the implementation.
		// The tests below test implementation details of the Fluid Cache, such as the usage of indexedDB.
		it("writes cached values to indexedDb", async () => {
			// We need to mock out the Date API to make this test work
			const clearDateMock = setupDateMock(100);

			fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("shouldBeInLocalStorage");
			const cachedItem = { dateToStore: "foo" };

			await fluidCache.put(cacheEntry, cachedItem);

			const db = await getFluidCacheIndexedDbInstance();
			assert.deepEqual(
				await db.get(FluidDriverObjectStoreName, getKeyForCacheEntry(cacheEntry)),
				{
					cacheItemId: "shouldBeInLocalStorage",
					cachedObject: {
						dateToStore: "foo",
					},
					createdTimeMs: 100,
					fileId: "myDocument",
					lastAccessTimeMs: 100,
					type: "snapshot",
					partitionKey: "FAKEPARTITIONKEY",
				},
			);
			db.close();

			clearDateMock();
		});

		it("does not throw when APIs are called and the database has been upgraded by another client", async () => {
			// Create a DB with a much newer version number to simulate an old client
			const newerDb = await openDB(FluidDriverCacheDBName, 1000000);

			fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("someKey");
			const cachedItem = { dateToStore: "foo" };
			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			newerDb.close();
			assert.strictEqual(result, undefined);
		});

		it("does not hang when an older client is blocking the database from opening", async () => {
			const olderDb = await openDB(FluidDriverCacheDBName, 1);

			fluidCache = getFluidCache();

			// put() should return gracefully even when the DB is blocked by an older client.
			// We intentionally do not call get() after put() here — a second blocked open
			// request creates a second leaked fake-indexeddb connection that never closes,
			// deadlocking the waitForOthersClosed loop in fake-indexeddb v3.
			await fluidCache.put(getMockCacheEntry("someKey"), { dateToStore: "foo" });
			olderDb.close();
		});

		it("does not hang when client is getting data after putting in the cache", async () => {
			fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("someKey");
			const cachedItem = { dateToStore: "foo" };
			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			assert.deepEqual(result, cachedItem);
		});

		it("does not hang when client is getting data after removing the entry from cache", async () => {
			fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("someKey");
			const cachedItem = { dateToStore: "foo" };
			await fluidCache.put(cacheEntry, cachedItem);
			await fluidCache.removeEntries(cacheEntry.file);
			const result = await fluidCache.get(cacheEntry);
			assert.strictEqual(result, undefined);
		});

		describe("update", () => {
			it("writes when the updater calls set with the entry absent", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("updateNew");
				const proposed = { rev: 1 };

				const seen: unknown[] = [];
				const wrote = await fluidCache.update(cacheEntry, (existing, set) => {
					seen.push(existing);
					set(proposed);
				});

				assert.strictEqual(wrote, true);
				assert.deepEqual(seen, [undefined]);
				assert.deepEqual(await fluidCache.get(cacheEntry), proposed);
			});

			it("passes the existing cached value to the updater", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("updateExisting");
				const initial = { rev: 1 };
				const proposed = { rev: 2 };

				await fluidCache.put(cacheEntry, initial);

				let observedExisting: unknown;
				const wrote = await fluidCache.update(cacheEntry, (existing, set) => {
					observedExisting = existing;
					set(proposed);
				});

				assert.strictEqual(wrote, true);
				assert.deepEqual(observedExisting, initial);
				assert.deepEqual(await fluidCache.get(cacheEntry), proposed);
			});

			it("supports read-modify-write derived from the existing value", async () => {
				// The motivating case for the callback shape: deriving the new value
				// from the existing one inside the atomic transaction.
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("updateRmw");
				await fluidCache.put(cacheEntry, { count: 1 });

				const wrote = await fluidCache.update(cacheEntry, (existing, set) => {
					const prev = (existing as { count: number } | undefined)?.count ?? 0;
					set({ count: prev + 1 });
				});

				assert.strictEqual(wrote, true);
				assert.deepEqual(await fluidCache.get(cacheEntry), { count: 2 });
			});

			it("does not overwrite when the updater returns without calling set", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("updateNoSet");
				const initial = { rev: 1 };

				await fluidCache.put(cacheEntry, initial);

				const wrote = await fluidCache.update(cacheEntry, () => {
					// updater inspects existing but chooses not to write
				});

				assert.strictEqual(wrote, false);
				assert.deepEqual(await fluidCache.get(cacheEntry), initial);
			});

			it("treats cross-partition existing entries as absent", async () => {
				fluidCache = getFluidCache({ partitionKey: "partitionA" });

				const cacheEntry = getMockCacheEntry("updateCrossPartition");
				const otherPartitionValue = { rev: 99, from: "B" };
				const proposed = { rev: 1, from: "A" };

				const partitionBCache = getFluidCache({ partitionKey: "partitionB" });
				extraCaches.push(partitionBCache);
				await partitionBCache.put(cacheEntry, otherPartitionValue);

				let observedExisting: unknown = "sentinel";
				const wrote = await fluidCache.update(cacheEntry, (existing, set) => {
					observedExisting = existing;
					set(proposed);
				});

				assert.strictEqual(wrote, true);
				assert.strictEqual(observedExisting, undefined);
				assert.deepEqual(await fluidCache.get(cacheEntry), proposed);
			});

			it("returns false and does not write when the updater throws", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("updateThrow");
				const initial = { rev: 1 };

				await fluidCache.put(cacheEntry, initial);

				const wrote = await fluidCache.update(cacheEntry, () => {
					throw new Error("updater failure");
				});

				assert.strictEqual(wrote, false);
				assert.deepEqual(await fluidCache.get(cacheEntry), initial);
			});

			it("does not write when the updater calls set then throws", async () => {
				// Throw-after-set should still abort: the updater's intent is ambiguous
				// and preserving the existing row is the safer default.
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("updateSetThenThrow");
				const initial = { rev: 1 };

				await fluidCache.put(cacheEntry, initial);

				const wrote = await fluidCache.update(cacheEntry, (_existing, set) => {
					set({ rev: 99 });
					throw new Error("after-set failure");
				});

				assert.strictEqual(wrote, false);
				assert.deepEqual(await fluidCache.get(cacheEntry), initial);
			});

			it("multi-set: last value wins", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("updateMultiSet");

				const wrote = await fluidCache.update(cacheEntry, (_existing, set) => {
					set({ rev: 1 });
					set({ rev: 2 });
					set({ rev: 3 });
				});

				assert.strictEqual(wrote, true);
				assert.deepEqual(await fluidCache.get(cacheEntry), { rev: 3 });
			});

			it("set called after the updater returned throws UsageError", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("updateLateSet");

				let capturedSet: ((value: unknown) => void) | undefined;
				const wrote = await fluidCache.update(cacheEntry, (_existing, set) => {
					capturedSet = set;
				});

				assert.strictEqual(wrote, false);
				assert.ok(capturedSet !== undefined);
				assert.throws(() => capturedSet?.({ rev: 1 }), /set called after updater returned/);
				// And the cache is still untouched.
				assert.strictEqual(await fluidCache.get(cacheEntry), undefined);
			});

			it("resolves concurrent update races deterministically via the updater", async () => {
				// Two FluidCache instances racing to write to the same key, where each
				// only writes if it has a higher revision than what is currently cached.
				// The higher-revision writer must win regardless of scheduling order.
				fluidCache = getFluidCache();
				const otherCache = getFluidCache();
				extraCaches.push(otherCache);

				const cacheEntry = getMockCacheEntry("updateRace");

				const writeIfNewer = async (cache: FluidCache, rev: number): Promise<boolean> =>
					cache.update(cacheEntry, (existing, set) => {
						const existingRev = (existing as { rev?: number } | undefined)?.rev ?? -1;
						if (rev > existingRev) {
							set({ rev });
						}
					});

				const [wroteHigh, wroteLow] = await Promise.all([
					writeIfNewer(fluidCache, 2),
					writeIfNewer(otherCache, 1),
				]);

				// At least one of the two writes must succeed (the very first one),
				// and the final state must reflect the higher revision regardless of order.
				assert.ok(wroteHigh || wroteLow);
				assert.deepEqual(await fluidCache.get(cacheEntry), { rev: 2 });
			});

			it("treats existing entries older than maxCacheItemAge as absent", async () => {
				const resetDateMock = setupDateMock(0);
				try {
					const maxAge = 5 * 60 * 1000;
					fluidCache = new FluidCache({
						partitionKey: mockPartitionKey,
						maxCacheItemAge: maxAge,
						closeDbAfterMs: immediateClose ? 0 : 100,
					});

					const cacheEntry = getMockCacheEntry("updateStale");
					await fluidCache.put(cacheEntry, { rev: 1 });

					// Advance well past maxCacheItemAge so the existing row is "stale"
					// under the same rules `get` applies.
					DateMock.mockTimeMs += maxAge * 2;

					let observedExisting: unknown = "sentinel";
					const wrote = await fluidCache.update(cacheEntry, (existing, set) => {
						observedExisting = existing;
						set({ rev: 2 });
					});

					assert.strictEqual(wrote, true);
					assert.strictEqual(
						observedExisting,
						undefined,
						"stale existing entries should be reported to the updater as undefined",
					);
				} finally {
					resetDateMock();
				}
			});
		});
	});
}
