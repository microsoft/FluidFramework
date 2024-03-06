/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICacheEntry } from "@fluidframework/odsp-driver-definitions";
import { openDB } from "idb";
import { FluidCache } from "../FluidCache.js";
import {
	getFluidCacheIndexedDbInstance,
	FluidDriverObjectStoreName,
	FluidDriverCacheDBName,
	getKeyForCacheEntry,
} from "../FluidCacheIndexedDb.js";

// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports, import/no-internal-modules
require("fake-indexeddb/auto");

const mockPartitionKey = "FAKEPARTITIONKEY";

class DateMock {
	// The current time being used by the mock
	public static mockTimeMs: number = 0;

	public static now() {
		return DateMock.mockTimeMs;
	}

	public getTime() {
		return DateMock.mockTimeMs;
	}
}

// Sets up a mock date time for the current test. Returns a function that should be called to reset the environment
function setupDateMock(startMockTime: number) {
	const realDate = window.Date;
	DateMock.mockTimeMs = startMockTime;
	(window.Date as any) = DateMock;

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

[true, false].forEach((immediateClose) => {
	function getFluidCache(config?: {
		maxCacheItemAge?: number;
		// eslint-disable-next-line @rushstack/no-new-null
		partitionKey?: string | null;
	}) {
		return new FluidCache({
			partitionKey: config?.partitionKey ?? mockPartitionKey,
			maxCacheItemAge: config?.maxCacheItemAge ?? 3 * 24 * 60 * 60 * 1000,
			closeDbAfterMs: immediateClose ? 0 : 100,
		});
	}
	describe(`Fluid Cache tests: immediateClose: ${immediateClose}`, () => {
		beforeEach(() => {
			// Reset the indexed db before each test so that it starts off in an empty state
			// eslint-disable-next-line import/no-internal-modules, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
			const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
			(window.indexedDB as any) = new FDBFactory();
		});

		it("returns undefined when there is nothing in the cache", async () => {
			const fluidCache = getFluidCache();

			const result = await fluidCache.get(getMockCacheEntry("shouldNotExist"));
			expect(result).toBeUndefined();
		});

		it("returns an item put in the cache", async () => {
			const fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("shouldExist");
			const cachedItem = { foo: "bar" };

			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			expect(result).toEqual(cachedItem);
		});

		it("returns an item put in the cache when max ops has not passed", async () => {
			const fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("stillGood");
			const cachedItem = { foo: "bar" };

			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			expect(result).toEqual(cachedItem);
		});

		it("does not return an item from the cache that is older than maxCacheItemAge", async () => {
			const clearTimeMock = setupDateMock(100);

			const fluidCache = getFluidCache({ maxCacheItemAge: 5000 });

			const cacheEntry = getMockCacheEntry("tooOld");
			const cachedItem = { foo: "bar" };

			await fluidCache.put(cacheEntry, cachedItem);

			expect(await fluidCache.get(cacheEntry)).toEqual(cachedItem);

			DateMock.mockTimeMs += 5050;

			const result = await fluidCache.get(cacheEntry);
			expect(result).toBeUndefined();

			clearTimeMock();
		});

		it("does not return items from the cache when the partition keys do not match", async () => {
			const fluidCache = getFluidCache({ partitionKey: "partitionKey1" });

			const cacheEntry = getMockCacheEntry("partitionKey1Data");
			const cachedItem = { foo: "bar" };
			await fluidCache.put(cacheEntry, cachedItem);

			expect(await fluidCache.get(cacheEntry)).toEqual(cachedItem);

			// We should not return the data from partition 1 when in partition 2
			const partition2FluidCache = getFluidCache({
				partitionKey: "partitionKey2",
			});
			expect(await partition2FluidCache.get(cacheEntry)).toEqual(undefined);
		});

		it("returns values from cache when partition key is null", async () => {
			const fluidCache = getFluidCache({ partitionKey: null });

			const cacheEntry = getMockCacheEntry("partitionKey1Data");
			const cachedItem = { foo: "bar" };
			await fluidCache.put(cacheEntry, cachedItem);

			expect(await fluidCache.get(cacheEntry)).toEqual(cachedItem);
		});

		it("implements the removeAllEntriesForDocId API", async () => {
			const fluidCache = getFluidCache();

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

			expect(await fluidCache.get(docId1Entry1)).not.toBeUndefined();
			expect(await fluidCache.get(docId2Entry1)).not.toBeUndefined();
			expect(await fluidCache.get(docId1Entry2)).not.toBeUndefined();

			await fluidCache.removeEntries(docId1Entry1.file);

			expect(await fluidCache.get(docId1Entry1)).toBeUndefined();
			expect(await fluidCache.get(docId2Entry1)).not.toBeUndefined();
			expect(await fluidCache.get(docId1Entry2)).toBeUndefined();
		});

		// The tests above test the public API of Fluid Cache.
		//  Those tests should not break if we changed the implementation.
		// The tests below test implementation details of the Fluid Cache, such as the usage of indexedDB.
		it("writes cached values to indexedDb", async () => {
			// We need to mock out the Date API to make this test work
			const clearDateMock = setupDateMock(100);

			const fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("shouldBeInLocalStorage");
			const cachedItem = { dateToStore: "foo" };

			await fluidCache.put(cacheEntry, cachedItem);

			const db = await getFluidCacheIndexedDbInstance();
			expect(
				await db.get(FluidDriverObjectStoreName, getKeyForCacheEntry(cacheEntry)),
			).toEqual({
				cacheItemId: "shouldBeInLocalStorage",
				cachedObject: {
					dateToStore: "foo",
				},
				createdTimeMs: 100,
				fileId: "myDocument",
				lastAccessTimeMs: 100,
				type: "snapshot",
				partitionKey: "FAKEPARTITIONKEY",
			});

			clearDateMock();
		});

		it("does not throw when APIs are called and the database has been upgraded by another client", async () => {
			// Create a DB with a much newer version number to simulate an old client
			await openDB(FluidDriverCacheDBName, 1000000);

			const fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("someKey");
			const cachedItem = { dateToStore: "foo" };
			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			expect(result).toEqual(undefined);
		});

		it("does not hang when an older client is blocking the database from opening", async () => {
			await openDB(FluidDriverCacheDBName, 1);

			const fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("someKey");
			const cachedItem = { dateToStore: "foo" };
			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			expect(result).toEqual(undefined);
		});

		it("does not hang when client is getting data after putting in the cache", async () => {
			const fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("someKey");
			const cachedItem = { dateToStore: "foo" };
			await fluidCache.put(cacheEntry, cachedItem);

			const result = await fluidCache.get(cacheEntry);
			expect(result).toEqual(cachedItem);
		});

		it("does not hang when client is getting data after removing the entry from cache", async () => {
			const fluidCache = getFluidCache();

			const cacheEntry = getMockCacheEntry("someKey");
			const cachedItem = { dateToStore: "foo" };
			await fluidCache.put(cacheEntry, cachedItem);
			await fluidCache.removeEntries(cacheEntry.file);
			const result = await fluidCache.get(cacheEntry);
			expect(result).toEqual(undefined);
		});
	});
});
