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
	});
}
