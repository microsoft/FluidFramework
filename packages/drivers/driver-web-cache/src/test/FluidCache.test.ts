/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ICacheEntry } from "@fluidframework/driver-definitions/internal";
import { getKeyForCacheEntry } from "@fluidframework/driver-utils/internal";
import { openDB } from "idb";

import { FluidCache, type FluidCacheChangeEvent } from "../FluidCache.js";
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
				cache?.dispose();
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

		describe("putIf", () => {
			it("writes when the predicate returns true and the entry is absent", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("casNew");
				const proposed = { rev: 1 };

				const seen: { existing: unknown; proposed: unknown }[] = [];
				const wrote = await fluidCache.putIf(cacheEntry, proposed, (existing, prop) => {
					seen.push({ existing, proposed: prop });
					return true;
				});

				assert.strictEqual(wrote, true);
				assert.deepEqual(seen, [{ existing: undefined, proposed }]);
				assert.deepEqual(await fluidCache.get(cacheEntry), proposed);
			});

			it("passes the existing cached value to the predicate", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("casExisting");
				const initial = { rev: 1 };
				const proposed = { rev: 2 };

				await fluidCache.put(cacheEntry, initial);

				let observedExisting: unknown;
				let observedProposed: unknown;
				const wrote = await fluidCache.putIf(cacheEntry, proposed, (existing, prop) => {
					observedExisting = existing;
					observedProposed = prop;
					return true;
				});

				assert.strictEqual(wrote, true);
				assert.deepEqual(observedExisting, initial);
				assert.deepEqual(observedProposed, proposed);
				assert.deepEqual(await fluidCache.get(cacheEntry), proposed);
			});

			it("does not overwrite when the predicate returns false", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("casReject");
				const initial = { rev: 1 };
				const proposed = { rev: 2 };

				await fluidCache.put(cacheEntry, initial);

				const wrote = await fluidCache.putIf(cacheEntry, proposed, () => false);

				assert.strictEqual(wrote, false);
				assert.deepEqual(await fluidCache.get(cacheEntry), initial);
			});

			it("treats cross-partition existing entries as absent", async () => {
				fluidCache = getFluidCache({ partitionKey: "partitionA" });

				const cacheEntry = getMockCacheEntry("casCrossPartition");
				const otherPartitionValue = { rev: 99, from: "B" };
				const proposed = { rev: 1, from: "A" };

				const partitionBCache = getFluidCache({ partitionKey: "partitionB" });
				extraCaches.push(partitionBCache);
				await partitionBCache.put(cacheEntry, otherPartitionValue);

				let observedExisting: unknown = "sentinel";
				const wrote = await fluidCache.putIf(cacheEntry, proposed, (existing) => {
					observedExisting = existing;
					return true;
				});

				assert.strictEqual(wrote, true);
				assert.strictEqual(observedExisting, undefined);
				assert.deepEqual(await fluidCache.get(cacheEntry), proposed);
			});

			it("returns false and does not write when the predicate throws", async () => {
				fluidCache = getFluidCache();

				const cacheEntry = getMockCacheEntry("casThrow");
				const initial = { rev: 1 };

				await fluidCache.put(cacheEntry, initial);

				const wrote = await fluidCache.putIf(cacheEntry, { rev: 2 }, () => {
					throw new Error("predicate failure");
				});

				assert.strictEqual(wrote, false);
				assert.deepEqual(await fluidCache.get(cacheEntry), initial);
			});

			it("resolves concurrent putIf races deterministically via the predicate", async () => {
				// Two FluidCache instances racing to write to the same key, where each
				// only writes if it has a higher revision than what is currently cached.
				// The higher-revision writer must win regardless of scheduling order.
				fluidCache = getFluidCache();
				const otherCache = getFluidCache();
				extraCaches.push(otherCache);

				const cacheEntry = getMockCacheEntry("casRace");

				const writeIfNewer = async (cache: FluidCache, rev: number): Promise<boolean> =>
					cache.putIf(cacheEntry, { rev }, (existing) => {
						const existingRev = (existing as { rev?: number } | undefined)?.rev ?? -1;
						return rev > existingRev;
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
		});

		describe("onChange notifications", () => {
			// Flush BroadcastChannel message delivery (Node delivers asynchronously via the
			// microtask/IO queues). A single setImmediate is sufficient because the channel
			// posts via the event loop and we just need to yield once.
			const flushBroadcast = async (): Promise<void> =>
				new Promise<void>((resolve) => setImmediate(resolve));

			it("delivers put events to other instances in the same partition", async () => {
				fluidCache = getFluidCache();
				const otherCache = getFluidCache();
				extraCaches.push(otherCache);

				const received: FluidCacheChangeEvent[] = [];
				otherCache.onChange((event) => received.push(event));

				const cacheEntry = getMockCacheEntry("notifyPut");
				await fluidCache.put(cacheEntry, { hello: "world" });
				await flushBroadcast();

				assert.deepEqual(received, [
					{
						op: "put",
						partitionKey: mockPartitionKey,
						fileId: "myDocument",
						type: "snapshot",
						cacheItemId: "notifyPut",
					},
				]);
			});

			it("does not fire on the same instance that posted the event", async () => {
				fluidCache = getFluidCache();

				const received: FluidCacheChangeEvent[] = [];
				fluidCache.onChange((event) => received.push(event));

				await fluidCache.put(getMockCacheEntry("selfNotify"), { x: 1 });
				await flushBroadcast();

				assert.deepEqual(received, []);
			});

			it("filters put/remove events by partition key", async () => {
				fluidCache = getFluidCache({ partitionKey: "partitionA" });
				const partitionBCache = getFluidCache({ partitionKey: "partitionB" });
				extraCaches.push(partitionBCache);

				const aReceived: FluidCacheChangeEvent[] = [];
				const bReceived: FluidCacheChangeEvent[] = [];
				fluidCache.onChange((event) => aReceived.push(event));
				partitionBCache.onChange((event) => bReceived.push(event));

				// A writes — only an "A-partition" listener on a different instance should see it.
				// fluidCache is the writer, so it doesn't see its own event (BC default).
				// partitionBCache is in a different partition, so it must filter the event out.
				await fluidCache.put(getMockCacheEntry("xPartition"), { v: 1 });
				await flushBroadcast();

				assert.deepEqual(aReceived, []);
				assert.deepEqual(bReceived, []);

				// Add a third A-partition cache to receive the event.
				const aReceiver = getFluidCache({ partitionKey: "partitionA" });
				extraCaches.push(aReceiver);
				const aReceiverEvents: FluidCacheChangeEvent[] = [];
				aReceiver.onChange((event) => aReceiverEvents.push(event));

				await fluidCache.put(getMockCacheEntry("xPartition2"), { v: 2 });
				await flushBroadcast();

				assert.deepEqual(aReceiverEvents, [
					{
						op: "put",
						partitionKey: "partitionA",
						fileId: "myDocument",
						type: "snapshot",
						cacheItemId: "xPartition2",
					},
				]);
				// B still doesn't receive A-partition events.
				assert.deepEqual(bReceived, []);
			});

			it("delivers removeFile events to all listeners regardless of partition", async () => {
				fluidCache = getFluidCache({ partitionKey: "partitionA" });
				const partitionBCache = getFluidCache({ partitionKey: "partitionB" });
				extraCaches.push(partitionBCache);

				const bReceived: FluidCacheChangeEvent[] = [];
				partitionBCache.onChange((event) => bReceived.push(event));

				const cacheEntry = getMockCacheEntry("forFileRemoval");
				await fluidCache.put(cacheEntry, { v: 1 });
				await fluidCache.removeEntries(cacheEntry.file);
				await flushBroadcast();

				assert.ok(
					bReceived.some((e) => e.op === "removeFile" && e.fileId === cacheEntry.file.docId),
					`expected removeFile event for ${cacheEntry.file.docId}, got ${JSON.stringify(bReceived)}`,
				);
			});

			it("fires a remove event for removeEntry", async () => {
				fluidCache = getFluidCache();
				const otherCache = getFluidCache();
				extraCaches.push(otherCache);

				const received: FluidCacheChangeEvent[] = [];
				otherCache.onChange((event) => received.push(event));

				const cacheEntry = getMockCacheEntry("removeOne");
				await fluidCache.put(cacheEntry, { v: 1 });
				await fluidCache.removeEntry(cacheEntry);
				await flushBroadcast();

				assert.ok(
					received.some(
						(e) =>
							e.op === "remove" &&
							e.partitionKey === mockPartitionKey &&
							e.cacheItemId === "removeOne",
					),
					`expected a remove event for "removeOne", got ${JSON.stringify(received)}`,
				);
			});

			it("fires a put event on successful putIf and nothing on a rejected putIf", async () => {
				fluidCache = getFluidCache();
				const otherCache = getFluidCache();
				extraCaches.push(otherCache);

				const received: FluidCacheChangeEvent[] = [];
				otherCache.onChange((event) => received.push(event));

				const cacheEntry = getMockCacheEntry("putIfNotify");

				const wroteFirst = await fluidCache.putIf(cacheEntry, { rev: 1 }, () => true);
				assert.strictEqual(wroteFirst, true);

				const wroteSecond = await fluidCache.putIf(cacheEntry, { rev: 2 }, () => false);
				assert.strictEqual(wroteSecond, false);

				await flushBroadcast();

				// Exactly one put event for the successful write — no event for the rejected one.
				const putsForKey = received.filter(
					(e) => e.op === "put" && e.cacheItemId === "putIfNotify",
				);
				assert.strictEqual(putsForKey.length, 1);
			});

			it("stops delivering events after the unsubscribe function is invoked", async () => {
				fluidCache = getFluidCache();
				const otherCache = getFluidCache();
				extraCaches.push(otherCache);

				const received: FluidCacheChangeEvent[] = [];
				const unsubscribe = otherCache.onChange((event) => received.push(event));

				await fluidCache.put(getMockCacheEntry("beforeUnsub"), { v: 1 });
				await flushBroadcast();
				const countBefore = received.length;

				unsubscribe();

				await fluidCache.put(getMockCacheEntry("afterUnsub"), { v: 2 });
				await flushBroadcast();

				assert.strictEqual(received.length, countBefore);
			});

			it("throws UsageError when onChange is called after dispose", async () => {
				fluidCache = getFluidCache();
				fluidCache.dispose();

				assert.throws(
					() => fluidCache.onChange(() => {}),
					(error: Error) => /disposed/i.test(error.message),
				);
			});
		});

		describe("post-dispose contract", () => {
			const disposedMatcher = (error: Error): boolean => /disposed/i.test(error.message);

			it("get throws UsageError after dispose", async () => {
				fluidCache = getFluidCache();
				const cacheEntry = getMockCacheEntry("postDisposeGet");
				await fluidCache.put(cacheEntry, { rev: 1 });
				fluidCache.dispose();

				await assert.rejects(async () => fluidCache.get(cacheEntry), disposedMatcher);
			});

			it("put throws UsageError after dispose", async () => {
				fluidCache = getFluidCache();
				fluidCache.dispose();

				const cacheEntry = getMockCacheEntry("postDisposePut");
				await assert.rejects(
					async () => fluidCache.put(cacheEntry, { rev: 1 }),
					disposedMatcher,
				);
			});

			it("putIf throws UsageError after dispose", async () => {
				fluidCache = getFluidCache();
				fluidCache.dispose();

				const cacheEntry = getMockCacheEntry("postDisposePutIf");
				await assert.rejects(
					async () => fluidCache.putIf(cacheEntry, { rev: 1 }, () => true),
					disposedMatcher,
				);
			});

			it("removeEntry throws UsageError after dispose", async () => {
				fluidCache = getFluidCache();
				const cacheEntry = getMockCacheEntry("postDisposeRemoveEntry");
				await fluidCache.put(cacheEntry, { rev: 1 });
				fluidCache.dispose();

				await assert.rejects(async () => fluidCache.removeEntry(cacheEntry), disposedMatcher);
			});

			it("removeEntries throws UsageError after dispose", async () => {
				fluidCache = getFluidCache();
				const cacheEntry = getMockCacheEntry("postDisposeRemoveEntries");
				await fluidCache.put(cacheEntry, { rev: 1 });
				fluidCache.dispose();

				await assert.rejects(
					async () => fluidCache.removeEntries(cacheEntry.file),
					disposedMatcher,
				);
			});

			it("does not resurrect the DB when dispose runs during an in-flight put", async () => {
				fluidCache = getFluidCache();
				const cacheEntry = getMockCacheEntry("postDisposeInflight");

				const pending = fluidCache.put(cacheEntry, { rev: 1 });
				// Synchronously dispose while the put is still awaiting openDb.
				fluidCache.dispose();

				// The in-flight put must reject rather than complete silently and leave
				// a resurrected DB connection behind.
				await assert.rejects(async () => pending, disposedMatcher);

				// A subsequent call must also throw (already covered above), and the
				// previously-persisted state from before dispose must still be readable
				// from a freshly-constructed FluidCache.
				const replacement = getFluidCache();
				extraCaches.push(replacement);
				// We don't assert on what the in-flight put persisted (it may or may not
				// have committed before openDb threw), but a fresh instance must not see
				// any lingering open connections from the disposed cache.
				await replacement.get(cacheEntry);
			});

			it("does not broadcast a change event when dispose runs mid-flight", async () => {
				const observer = getFluidCache();
				extraCaches.push(observer);

				const received: FluidCacheChangeEvent[] = [];
				observer.onChange((event) => received.push(event));

				fluidCache = getFluidCache();
				const cacheEntry = getMockCacheEntry("postDisposeNoBroadcast");

				// Start the write, then dispose synchronously. Whether the openDb race
				// fires first or the post-write `throwIfDisposed` does, the contract is
				// the same: the call rejects with `UsageError` and no change event is
				// posted to other instances.
				const pending = fluidCache.put(cacheEntry, { rev: 1 });
				fluidCache.dispose();
				await assert.rejects(async () => pending, disposedMatcher);

				// Allow any (incorrectly emitted) broadcast to deliver before asserting.
				await new Promise<void>((resolve) => setImmediate(resolve));

				const leakedPuts = received.filter(
					(e) => e.op === "put" && e.cacheItemId === "postDisposeNoBroadcast",
				);
				assert.deepEqual(
					leakedPuts,
					[],
					"a disposed FluidCache must not broadcast change events after teardown",
				);
			});

			it("putIf rejects with UsageError when dispose runs mid-flight and the predicate would reject", async () => {
				fluidCache = getFluidCache();
				const cacheEntry = getMockCacheEntry("postDisposePutIfReject");

				// Predicate that would normally cause `putIf` to cooperatively return
				// `false`. With dispose racing the in-flight transaction, the contract
				// requires `UsageError` so the caller can distinguish "predicate
				// rejected" from "cache was disposed mid-flight".
				const pending = fluidCache.putIf(cacheEntry, { rev: 1 }, () => false);
				fluidCache.dispose();

				await assert.rejects(async () => pending, disposedMatcher);
			});

			it("get rejects with UsageError when dispose runs mid-flight", async () => {
				// Seed a value with a separate cache so there is something to read,
				// then start a `get` on a fresh cache and dispose synchronously to
				// race the in-flight IDB read. The read success path must reject
				// rather than silently surface the cached value.
				const seed = getFluidCache();
				extraCaches.push(seed);
				const cacheEntry = getMockCacheEntry("postDisposeGetInflight");
				await seed.put(cacheEntry, { rev: 1 });

				fluidCache = getFluidCache();
				const pending = fluidCache.get(cacheEntry);
				fluidCache.dispose();

				await assert.rejects(async () => pending, disposedMatcher);
			});
		});

		describe("putIf staleness", () => {
			it("treats existing entries older than maxCacheItemAge as absent", async () => {
				const resetDateMock = setupDateMock(0);
				try {
					const maxAge = 5 * 60 * 1000;
					fluidCache = new FluidCache({
						partitionKey: mockPartitionKey,
						maxCacheItemAge: maxAge,
						closeDbAfterMs: immediateClose ? 0 : 100,
					});

					const cacheEntry = getMockCacheEntry("putIfStale");
					await fluidCache.put(cacheEntry, { rev: 1 });

					// Advance well past maxCacheItemAge so the existing row is "stale"
					// under the same rules `get` applies.
					DateMock.mockTimeMs += maxAge * 2;

					let observedExisting: unknown = "sentinel";
					const wrote = await fluidCache.putIf(cacheEntry, { rev: 2 }, (existing) => {
						observedExisting = existing;
						return true;
					});

					assert.strictEqual(wrote, true);
					assert.strictEqual(
						observedExisting,
						undefined,
						"stale existing entries should be reported to the predicate as undefined",
					);
				} finally {
					resetDateMock();
				}
			});
		});
	});
}
