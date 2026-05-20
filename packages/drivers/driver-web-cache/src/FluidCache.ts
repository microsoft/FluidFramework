/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	IPersistedCache,
	IFileEntry,
	ICacheEntry,
} from "@fluidframework/driver-definitions/internal";
import {
	getKeyForCacheEntry,
	maximumCacheDurationMs,
} from "@fluidframework/driver-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import { UsageError, createChildLogger } from "@fluidframework/telemetry-utils/internal";
import type { IDBPDatabase } from "idb";

import type { FluidCacheDBSchema } from "./FluidCacheIndexedDb.js";
import {
	FluidDriverObjectStoreName,
	getFluidCacheIndexedDbInstance,
} from "./FluidCacheIndexedDb.js";
import {
	FluidCacheErrorEvent,
	FluidCacheEventSubCategories,
	FluidCacheGenericEvent,
} from "./fluidCacheTelemetry.js";
import { pkgVersion } from "./packageVersion.js";
import { scheduleIdleTask } from "./scheduleIdleTask.js";

// Some browsers have a usageDetails property that will tell you more detailed information
// on how the storage is being used
interface StorageQuotaUsageDetails {
	indexedDB: number | undefined;
}

/**
 * @legacy @beta
 */
export interface FluidCacheConfig {
	/**
	 * A string to specify what partition of the cache you wish to use (e.g. a user id).
	 * Null can be used to explicity indicate no partitioning, and has been chosen
	 * vs undefined so that it is clear this is an intentional choice by the caller.
	 * A null value should only be used when the host can ensure that the cache is not able
	 * to be shared with multiple users.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	partitionKey: string | null;

	/**
	 * A logger that can be used to get insight into cache performance and errors
	 */
	logger?: ITelemetryBaseLogger;

	/**
	 * A value in milliseconds that determines the maximum age of a cache entry to return.
	 * If an entry exists in the cache, but is older than this value, the cached value will not be returned.
	 */
	maxCacheItemAge: number;

	/**
	 * Each time db is opened, it will remain open for this much time. To improve perf, if this property is set as
	 * any number greater than 0, then db will not be closed immediately after usage. This value is in milliseconds.
	 */
	closeDbAfterMs?: number;
}

/**
 * Notification posted by a `FluidCache` instance when it mutates the underlying IndexedDB.
 * Other `FluidCache` instances bound to the same browsing context (e.g. other tabs)
 * receive these events through {@link FluidCache.onChange}.
 *
 * @legacy @beta
 */
export type FluidCacheChangeEvent =
	| {
			/**
			 * A single entry was inserted, updated, or removed.
			 * - `put` is fired when `put` or a successful `putIf` writes a value.
			 * - `remove` is fired when `removeEntry` deletes an entry.
			 *
			 * Listeners only receive `put`/`remove` events whose `partitionKey` matches
			 * the partition key of the receiving `FluidCache` instance, consistent with
			 * the semantics of `get`.
			 */
			readonly op: "put" | "remove";
			// eslint-disable-next-line @rushstack/no-new-null
			readonly partitionKey: string | null;
			readonly fileId: string;
			readonly type: string;
			readonly cacheItemId: string;
	  }
	| {
			/**
			 * All entries for a document were removed via `removeEntries`. This operation
			 * deletes rows regardless of their partition key, so the event itself carries
			 * no partition information and is delivered to all listeners.
			 */
			readonly op: "removeFile";
			readonly fileId: string;
	  };

/**
 * Name of the `BroadcastChannel` used to deliver cache-change notifications between
 * `FluidCache` instances. A single channel is used for the entire driver cache; partition
 * scoping is applied by the receiving listener.
 */
const FluidCacheBroadcastChannelName = "fluid-driver-cache";

/**
 * A cache that can be used by the Fluid ODSP driver to cache data for faster performance.
 * @legacy @beta
 */
export class FluidCache implements IPersistedCache {
	private readonly logger: TelemetryLoggerExt;

	private readonly partitionKey: string | null;

	private readonly maxCacheItemAge: number;
	private readonly closeDbImmediately: boolean = true;
	private readonly closeDbAfterMs: number;
	private db: IDBPDatabase<FluidCacheDBSchema> | undefined;
	private dbCloseTimer: ReturnType<typeof setTimeout> | undefined;
	private dbReuseCount: number = -1;

	private readonly broadcastChannel: BroadcastChannel | undefined;
	private readonly changeListeners = new Set<(event: FluidCacheChangeEvent) => void>();
	private disposed = false;

	constructor(config: FluidCacheConfig) {
		const { logger, partitionKey, maxCacheItemAge, closeDbAfterMs } = config;
		this.logger = createChildLogger({ logger });
		this.partitionKey = partitionKey;
		if (maxCacheItemAge > maximumCacheDurationMs) {
			const error = new UsageError(
				`maxCacheItemAge(${maxCacheItemAge}) cannot be greater than ${maximumCacheDurationMs}`,
				{
					maxCacheItemAge,
					maximumCacheDurationMs,
					pkgVersion,
				},
			);
			// go with logging, rather than throwing for now
			// as throwing could break existing usages
			this.logger.sendErrorEvent(
				{
					eventName: "maxCacheItemAgeTooLarge",
					subCategory: FluidCacheEventSubCategories.FluidCache,
				},
				error,
			);
		}
		this.maxCacheItemAge = Math.min(maxCacheItemAge, maximumCacheDurationMs);
		this.closeDbAfterMs = closeDbAfterMs ?? 0;
		if (this.closeDbAfterMs > 0) {
			this.closeDbImmediately = false;
		}

		scheduleIdleTask(async () => {
			// If the cache was disposed before this idle callback runs, skip the work and
			// any associated telemetry — the host has indicated they no longer want this
			// cache observing or touching IndexedDB.
			if (this.disposed) {
				return;
			}
			// Log how much storage space is currently being used by indexed db.
			// NOTE: This API is not supported in all browsers and it doesn't let you see the size of a specific DB.
			// Exception added when eslint rule was added, this should be revisited when modifying this code
			if (navigator.storage?.estimate) {
				const estimate = await navigator.storage.estimate();
				if (this.disposed) {
					return;
				}

				// Some browsers have a usageDetails property that will tell you
				// more detailed information on how the storage is being used
				let indexedDBSize: number | undefined;
				if ("usageDetails" in estimate) {
					indexedDBSize = ((estimate as any).usageDetails as StorageQuotaUsageDetails)
						.indexedDB;
				}

				this.logger.sendTelemetryEvent({
					eventName: FluidCacheGenericEvent.FluidCacheStorageInfo,
					subCategory: FluidCacheEventSubCategories.FluidCache,
					quota: estimate.quota,
					usage: estimate.usage,
					indexedDBSize,
					pkgVersion,
				});
			}
		});

		scheduleIdleTask(async () => {
			// Honor the dispose contract: if the host disposed the cache before this idle
			// cleanup callback ran, do not open a fresh IndexedDB connection or perform any
			// maintenance writes. This idle task calls `getFluidCacheIndexedDbInstance`
			// directly rather than `openDb()`, so it needs its own disposed guard.
			if (this.disposed) {
				return;
			}
			let db: IDBPDatabase<FluidCacheDBSchema> | undefined;

			// Delete entries that have not been accessed recently to clean up space
			try {
				db = await getFluidCacheIndexedDbInstance(this.logger);
				if (this.disposed) {
					return;
				}

				const transaction = db.transaction(FluidDriverObjectStoreName, "readwrite");
				const index = transaction.store.index("createdTimeMs");
				// Get items which were cached before the maxCacheItemAge.
				const keysToDelete = await index.getAllKeys(
					IDBKeyRange.upperBound(Date.now() - this.maxCacheItemAge),
				);
				if (this.disposed) {
					return;
				}

				await Promise.all(keysToDelete.map(async (key) => transaction.store.delete(key)));
				await transaction.done;
			} catch (error: any) {
				this.logger.sendErrorEvent(
					{
						eventName: FluidCacheErrorEvent.FluidCacheDeleteOldEntriesError,
						pkgVersion,
					},
					error,
				);
			} finally {
				db?.close();
			}
		});

		// Wire up cross-instance change notifications via BroadcastChannel. The channel is
		// always created (when supported) so writes from this instance reach other tabs,
		// even when no local listeners are registered yet. If `BroadcastChannel` is not
		// available (e.g. older environments), notifications silently degrade to a no-op.
		if (typeof BroadcastChannel !== "undefined") {
			this.broadcastChannel = new BroadcastChannel(FluidCacheBroadcastChannelName);
			this.broadcastChannel.addEventListener("message", (messageEvent: MessageEvent) => {
				this.dispatchChangeEvent(messageEvent.data as FluidCacheChangeEvent);
			});
			// In Node, BroadcastChannel keeps the event loop alive until closed. Calling
			// `unref` (when available) lets test processes and short-lived scripts exit
			// even if a FluidCache instance was never disposed.
			(this.broadcastChannel as unknown as { unref?: () => void }).unref?.();
		}
	}

	/**
	 * Subscribe to cache-change notifications posted by other `FluidCache` instances
	 * (typically in other browser tabs sharing this origin's IndexedDB).
	 *
	 * Listeners are invoked with a {@link FluidCacheChangeEvent}. Per-entry `put` and
	 * `remove` events are filtered to the partition key of this `FluidCache`, matching
	 * the partition semantics of `get`. `removeFile` events are delivered unconditionally
	 * because `removeEntries` deletes rows regardless of partition.
	 *
	 * Note: `BroadcastChannel` does not echo a message back to the instance that posted
	 * it, so writes performed by *this* `FluidCache` do not trigger its own listeners.
	 * Other `FluidCache` instances (including ones in the same tab) will receive them.
	 *
	 * @returns a function that unregisters the listener. Idempotent.
	 */
	public onChange(listener: (event: FluidCacheChangeEvent) => void): () => void {
		if (this.disposed) {
			throw new UsageError("Cannot subscribe to a disposed FluidCache");
		}
		this.changeListeners.add(listener);
		return () => {
			this.changeListeners.delete(listener);
		};
	}

	/**
	 * Tear down resources held by the cache: the `BroadcastChannel` used for change
	 * notifications, any open IndexedDB connection, and the close timer.
	 *
	 * After `dispose` returns, every other public method (`get`, `put`, `putIf`,
	 * `removeEntry`, `removeEntries`, `onChange`) throws a `UsageError`. Operations
	 * that were already in flight when `dispose` was called also reject with a
	 * `UsageError`, and crucially, the IndexedDB connection is *not* lazily
	 * reopened by such an in-flight call.
	 *
	 * Calling `dispose` more than once is a no-op.
	 */
	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.changeListeners.clear();
		this.broadcastChannel?.close();
		clearTimeout(this.dbCloseTimer);
		this.dbCloseTimer = undefined;
		this.db?.close();
		this.db = undefined;
	}

	private throwIfDisposed(): void {
		if (this.disposed) {
			throw new UsageError("FluidCache is disposed");
		}
	}

	private dispatchChangeEvent(event: FluidCacheChangeEvent): void {
		// `put` and `remove` are partition-scoped; `removeFile` is delivered to all listeners
		// because it has no associated partition (see FluidCacheChangeEvent docs).
		if (event.op !== "removeFile" && event.partitionKey !== this.partitionKey) {
			return;
		}
		for (const listener of this.changeListeners) {
			try {
				listener(event);
			} catch (error: any) {
				this.logger.sendErrorEvent(
					{ eventName: FluidCacheErrorEvent.FluidCacheChangeListenerError, pkgVersion },
					error,
				);
			}
		}
	}

	private broadcast(event: FluidCacheChangeEvent): void {
		// Never emit a change event after the cache has been disposed: `broadcastChannel`
		// is closed in `dispose()` and `postMessage` would otherwise throw on every call.
		if (this.disposed) {
			return;
		}
		// Post to other instances first; failures in postMessage shouldn't surface to callers.
		try {
			this.broadcastChannel?.postMessage(event);
		} catch (error: any) {
			this.logger.sendErrorEvent(
				{ eventName: FluidCacheErrorEvent.FluidCacheBroadcastError, pkgVersion },
				error,
			);
		}
	}

	private async openDb(): Promise<IDBPDatabase<FluidCacheDBSchema>> {
		this.throwIfDisposed();
		if (this.closeDbImmediately) {
			const dbInstance = await getFluidCacheIndexedDbInstance(this.logger);
			// Dispose may have run while we awaited the IDB open. Close the just-acquired
			// connection and reject so callers do not silently operate on a disposed cache.
			if (this.disposed) {
				dbInstance.close();
				throw new UsageError("FluidCache was disposed during openDb");
			}
			return dbInstance;
		}
		if (this.db === undefined) {
			const dbInstance = await getFluidCacheIndexedDbInstance(this.logger);
			// Dispose may have run while we awaited the IDB open. Close the just-acquired
			// connection and reject so we never resurrect the DB or arm a fresh close
			// timer past dispose.
			if (this.disposed) {
				dbInstance.close();
				throw new UsageError("FluidCache was disposed during openDb");
			}
			if (this.db === undefined) {
				// Reset the counter on first open.
				this.dbReuseCount = -1;
				this.db = dbInstance;
			} else {
				dbInstance.close();
				this.dbReuseCount += 1;
				return this.db;
			}
			// Need to close the db on version change if opened.
			this.db.onversionchange = (ev) => {
				this.db?.close();
				this.db = undefined;
				clearTimeout(this.dbCloseTimer);
				this.dbCloseTimer = undefined;
			};
			this.db.addEventListener("close", (ev) => {
				clearTimeout(this.dbCloseTimer);
				this.dbCloseTimer = undefined;
				this.db = undefined;
			});
			// Schedule db close after this.closeDbAfterMs.
			assert(this.dbCloseTimer === undefined, 0x6c6 /* timer should not be set yet!! */);
			this.dbCloseTimer = setTimeout(() => {
				this.db?.close();
				this.db = undefined;
				this.dbCloseTimer = undefined;
			}, this.closeDbAfterMs);
		}
		assert(this.db !== undefined, 0x6c7 /* db should be intialized by now */);
		this.dbReuseCount += 1;
		return this.db;
	}

	private closeDb(db?: IDBPDatabase<FluidCacheDBSchema>): void {
		if (this.closeDbImmediately) {
			db?.close();
		}
	}

	public async removeEntries(file: IFileEntry): Promise<void> {
		this.throwIfDisposed();
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		let removed = false;
		try {
			db = await this.openDb();

			const transaction = db.transaction(FluidDriverObjectStoreName, "readwrite");
			const index = transaction.store.index("fileId");

			const keysToDelete = await index.getAllKeys(file.docId);

			await Promise.all(keysToDelete.map(async (key) => transaction.store.delete(key)));
			await transaction.done;
			// Dispose may have landed during one of the awaits above. Reject before
			// reporting success or broadcasting so the caller observes the disposed
			// state cleanly and no `removeFile` event escapes after teardown.
			this.throwIfDisposed();
			removed = keysToDelete.length > 0;
		} catch (error: any) {
			// If dispose ran during the operation, surface that to the caller instead of
			// silently swallowing the failure, matching the post-dispose throw contract.
			this.throwIfDisposed();
			this.logger.sendErrorEvent(
				{
					eventName: FluidCacheErrorEvent.FluidCacheDeleteOldEntriesError,
					pkgVersion,
				},
				error,
			);
		} finally {
			this.closeDb(db);
		}
		if (removed) {
			this.broadcast({ op: "removeFile", fileId: file.docId });
		}
	}

	public async removeEntry(entry: ICacheEntry): Promise<void> {
		this.throwIfDisposed();
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		let removed = false;
		try {
			db = await this.openDb();

			const key = getKeyForCacheEntry(entry);
			await db.delete(FluidDriverObjectStoreName, key);
			this.throwIfDisposed();
			removed = true;
		} catch (error: any) {
			this.throwIfDisposed();
			this.logger.sendErrorEvent(
				{
					eventName: FluidCacheErrorEvent.FluidCacheDeleteSingleEntryError,
					pkgVersion,
				},
				error,
			);
		} finally {
			this.closeDb(db);
		}
		if (removed) {
			this.broadcast({
				op: "remove",
				partitionKey: this.partitionKey,
				fileId: entry.file.docId,
				type: entry.type,
				cacheItemId: entry.key,
			});
		}
	}

	public async get(cacheEntry: ICacheEntry): Promise<any> {
		this.throwIfDisposed();
		const startTime = performance.now();

		const cachedItem = await this.getItemFromCache(cacheEntry);

		this.logger.sendPerformanceEvent({
			eventName: "FluidCacheAccess",
			cacheHit: cachedItem !== undefined,
			type: cacheEntry.type,
			duration: performance.now() - startTime,
			dbOpenPerf: cachedItem?.dbOpenPerf,
			dbReuseCount: this.dbReuseCount,
			pkgVersion,
		});

		// Value will contain metadata like the expiry time, we just want to return the object we were asked to cache
		return cachedItem?.cachedObject;
	}

	private async getItemFromCache(cacheEntry: ICacheEntry): Promise<any> {
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		try {
			const key = getKeyForCacheEntry(cacheEntry);

			const dbOpenStartTime = performance.now();
			db = await this.openDb();
			const dbOpenPerf = performance.now() - dbOpenStartTime;
			const value = await db.get(FluidDriverObjectStoreName, key);
			// Dispose may have landed during `await db.get(...)`. Reject before
			// surfacing the cached value so the read success path observes the
			// disposed state cleanly, matching the post-await guard on the write
			// methods and the existing catch-block guard below.
			this.throwIfDisposed();

			if (!value) {
				this.closeDb(db);
				return undefined;
			}

			// If the data does not come from the same partition, don't return it
			if (value.partitionKey !== this.partitionKey) {
				this.logger.sendTelemetryEvent({
					eventName: FluidCacheGenericEvent.FluidCachePartitionKeyMismatch,
					subCategory: FluidCacheEventSubCategories.FluidCache,
					pkgVersion,
				});

				this.closeDb(db);
				return undefined;
			}

			const currentTime = Date.now();

			// If too much time has passed since this cache entry was used, we will also return undefined
			if (currentTime - value.createdTimeMs > this.maxCacheItemAge) {
				this.closeDb(db);
				return undefined;
			}

			this.closeDb(db);
			return { ...value, dbOpenPerf };
		} catch (error: any) {
			// If dispose ran during the operation, surface that to the caller instead of
			// silently returning undefined, matching the post-dispose throw contract.
			this.throwIfDisposed();
			// We can fail to open the db for a variety of reasons,
			// such as the database version having upgraded underneath us. Return undefined in this case
			this.logger.sendErrorEvent(
				{ eventName: FluidCacheErrorEvent.FluidCacheGetError, pkgVersion },
				error,
			);
			this.closeDb(db);
			return undefined;
		}
	}

	public async put(entry: ICacheEntry, value: any): Promise<void> {
		this.throwIfDisposed();
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		let wrote = false;
		try {
			db = await this.openDb();

			await db.put(
				FluidDriverObjectStoreName,
				this.buildRecord(entry, value),
				getKeyForCacheEntry(entry),
			);
			// Dispose may have landed during `await db.put(...)`. Reject before reporting
			// success or broadcasting so the caller observes the disposed state cleanly
			// and no `put` event escapes after teardown.
			this.throwIfDisposed();
			wrote = true;
			this.closeDb(db);
		} catch (error: any) {
			this.throwIfDisposed();
			// We can fail to open the db for a variety of reasons,
			// such as the database version having upgraded underneath us
			this.logger.sendErrorEvent(
				{ eventName: FluidCacheErrorEvent.FluidCachePutError, pkgVersion },
				error,
			);
		} finally {
			this.closeDb(db);
		}
		if (wrote) {
			this.broadcast({
				op: "put",
				partitionKey: this.partitionKey,
				fileId: entry.file.docId,
				type: entry.type,
				cacheItemId: entry.key,
			});
		}
	}

	/**
	 * Conditionally writes `value` if `shouldWrite` returns true.
	 *
	 * The existing entry is read and (if `shouldWrite` returns true) the new entry is
	 * written inside a single IndexedDB `readwrite` transaction. This provides
	 * compare-and-swap semantics for callers sharing the same underlying IndexedDB
	 * instance (e.g. multiple browser tabs racing to persist pending state).
	 *
	 * @param entry - cache entry; identifies the file and the key within that file.
	 * @param value - the proposed JSON-serializable value to write if `shouldWrite` returns true.
	 * @param shouldWrite - synchronous predicate invoked with `(existing, proposed)`.
	 * `existing` is the currently-cached value, or `undefined` when the cached row is invisible
	 * under the same rules `get` applies: no entry exists for the key, the existing entry
	 * belongs to a different partition, or the existing entry is older than `maxCacheItemAge`.
	 * `proposed` is the same `value` argument, provided so the predicate can be self-contained.
	 *
	 * Note that when the predicate returns `true`, the write always proceeds and atomically
	 * replaces whatever row exists at the key, *including* cross-partition or stale rows that
	 * the predicate saw as `undefined`. This matches the unconditional overwrite behavior of
	 * `put`. Callers who must preserve cross-partition rows should not use `putIf`.
	 *
	 * The predicate must be synchronous: IndexedDB transactions auto-close on any non-IDB
	 * await, which would silently break the atomicity that makes the compare-and-swap correct.
	 * @returns `true` if the new value was written; `false` if the predicate rejected the write
	 * or an error occurred. Errors are logged and not thrown, matching the behavior of `put`.
	 */
	public async putIf(
		entry: ICacheEntry,
		value: unknown,
		shouldWrite: (existing: unknown, proposed: unknown) => boolean,
	): Promise<boolean> {
		this.throwIfDisposed();
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		let wrote = false;
		try {
			db = await this.openDb();

			const key = getKeyForCacheEntry(entry);
			const transaction = db.transaction(FluidDriverObjectStoreName, "readwrite");
			const existing = await transaction.store.get(key);
			// Surface the cached value to the predicate only when the existing entry is
			// visible under the same rules `get` applies: same partition and not older
			// than `maxCacheItemAge`. Cross-partition and stale entries are treated as
			// absent so the predicate sees the same view it would under `get`+`put`.
			const existingVisible =
				existing?.partitionKey === this.partitionKey &&
				Date.now() - existing.createdTimeMs <= this.maxCacheItemAge;
			const existingValue = existingVisible ? existing?.cachedObject : undefined;

			if (!shouldWrite(existingValue, value)) {
				await transaction.done;
				// Dispose may have landed during `await transaction.done`. Reject before
				// returning the cooperative `false` so an awaiting caller cannot
				// confuse "predicate rejected the write" with "cache was disposed
				// mid-flight" — matching the post-await guard on the success branch.
				this.throwIfDisposed();
				return false;
			}

			await transaction.store.put(this.buildRecord(entry, value), key);
			await transaction.done;
			// Dispose may have landed during the awaits above. Reject before reporting
			// success or broadcasting so the caller observes the disposed state cleanly
			// and no `put` event escapes after teardown.
			this.throwIfDisposed();
			wrote = true;
		} catch (error: any) {
			this.throwIfDisposed();
			this.logger.sendErrorEvent(
				{ eventName: FluidCacheErrorEvent.FluidCachePutError, pkgVersion },
				error,
			);
			return false;
		} finally {
			this.closeDb(db);
		}
		if (wrote) {
			this.broadcast({
				op: "put",
				partitionKey: this.partitionKey,
				fileId: entry.file.docId,
				type: entry.type,
				cacheItemId: entry.key,
			});
		}
		return wrote;
	}

	private buildRecord(
		entry: ICacheEntry,
		value: unknown,
	): FluidCacheDBSchema[typeof FluidDriverObjectStoreName]["value"] {
		const currentTime = Date.now();
		return {
			cachedObject: value,
			fileId: entry.file.docId,
			type: entry.type,
			cacheItemId: entry.key,
			partitionKey: this.partitionKey,
			createdTimeMs: currentTime,
			lastAccessTimeMs: currentTime,
		};
	}
}
