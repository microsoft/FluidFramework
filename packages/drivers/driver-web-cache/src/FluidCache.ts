/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, isPromiseLike } from "@fluidframework/core-utils/internal";
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
			// Log how much storage space is currently being used by indexed db.
			// NOTE: This API is not supported in all browsers and it doesn't let you see the size of a specific DB.
			// Exception added when eslint rule was added, this should be revisited when modifying this code
			if (navigator.storage?.estimate) {
				const estimate = await navigator.storage.estimate();

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
			let db: IDBPDatabase<FluidCacheDBSchema> | undefined;

			// Delete entries that have not been accessed recently to clean up space
			try {
				db = await getFluidCacheIndexedDbInstance(this.logger);

				const transaction = db.transaction(FluidDriverObjectStoreName, "readwrite");
				const index = transaction.store.index("createdTimeMs");
				// Get items which were cached before the maxCacheItemAge.
				const keysToDelete = await index.getAllKeys(
					IDBKeyRange.upperBound(Date.now() - this.maxCacheItemAge),
				);

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
	}

	private async openDb(): Promise<IDBPDatabase<FluidCacheDBSchema>> {
		if (this.closeDbImmediately) {
			return getFluidCacheIndexedDbInstance(this.logger);
		}
		if (this.db === undefined) {
			const dbInstance = await getFluidCacheIndexedDbInstance(this.logger);
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
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		try {
			db = await this.openDb();

			const transaction = db.transaction(FluidDriverObjectStoreName, "readwrite");
			const index = transaction.store.index("fileId");

			const keysToDelete = await index.getAllKeys(file.docId);

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
			this.closeDb(db);
		}
	}

	public async removeEntry(entry: ICacheEntry): Promise<void> {
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		try {
			db = await this.openDb();

			const key = getKeyForCacheEntry(entry);
			await db.delete(FluidDriverObjectStoreName, key);
		} catch (error: any) {
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
	}

	public async get(cacheEntry: ICacheEntry): Promise<any> {
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
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		try {
			db = await this.openDb();

			const currentTime = Date.now();

			await db.put(
				FluidDriverObjectStoreName,
				{
					cachedObject: value,
					fileId: entry.file.docId,
					type: entry.type,
					cacheItemId: entry.key,
					partitionKey: this.partitionKey,
					createdTimeMs: currentTime,
					lastAccessTimeMs: currentTime,
				},
				getKeyForCacheEntry(entry),
			);
			this.closeDb(db);
		} catch (error: any) {
			// We can fail to open the db for a variety of reasons,
			// such as the database version having upgraded underneath us
			this.logger.sendErrorEvent(
				{ eventName: FluidCacheErrorEvent.FluidCachePutError, pkgVersion },
				error,
			);
		} finally {
			this.closeDb(db);
		}
	}

	/**
	 * Atomically reads the existing cached entry, hands it to `updater`, and writes a
	 * new value iff `updater` calls the supplied `set` callback. The read and the
	 * conditional write happen inside a single IndexedDB `readwrite` transaction, so
	 * the decision sees a consistent view across consumers sharing the same underlying
	 * IndexedDB instance (for example, multiple browser tabs racing to persist pending
	 * state).
	 *
	 * @remarks
	 * The implementation uses `transaction.store.get` + `transaction.store.put` rather
	 * than an IDB cursor. Both run inside the same `readwrite` transaction, so the
	 * atomicity guarantee is identical, and the get/put pair is materially simpler
	 * to reason about for a single-key update. A cursor would be the right tool if we
	 * needed to iterate or range-scan; for a known key we don't.
	 *
	 * @param entry - cache entry; identifies the file and the key within that file.
	 * @param updater - synchronous callback invoked with `(existing, set)`.
	 * `existing` is the currently-cached value, or `undefined` when the cached row is
	 * invisible under the same rules `get` applies: no entry exists for the key, the
	 * existing entry belongs to a different partition, or the existing entry is older
	 * than `maxCacheItemAge`. The updater can derive the new value from `existing`
	 * (read-modify-write) or ignore it entirely. To commit a write, call `set(value)`;
	 * to leave the cache untouched, return without calling `set`. Stored via IndexedDB
	 * structured clone, with the same value requirements as {@link FluidCache.put} —
	 * not restricted to JSON-serializable values.
	 *
	 * Calling `set(undefined)` removes the row at the key (equivalent to
	 * {@link FluidCache.removeEntry} inside the same atomic transaction). `get`
	 * already collapses "no entry" and "entry stored as undefined" into the same
	 * observable result, so the delete-on-undefined semantics gives callers an
	 * atomic conditional-delete without ambiguity for any meaningful use case.
	 *
	 * The updater itself must be synchronous and `set` must be called from within it.
	 * IndexedDB transactions auto-close on any non-IDB await, which would silently
	 * break the atomicity that makes the update correct. Two guards make misuse
	 * loud rather than silent: calling `set` after `updater` has returned throws a
	 * `UsageError` at the call site; returning a thenable (e.g. an `async` updater)
	 * is detected after `updater` returns, aborts the transaction, and is logged
	 * under `FluidCacheUpdateCallbackError`. If `updater` calls `set` more than
	 * once, the last value wins.
	 *
	 * When `set` is called, the write (or delete) atomically replaces whatever row
	 * exists at the key, including cross-partition or stale rows that the updater
	 * saw as `undefined`. This matches the unconditional overwrite behavior of
	 * `put`. Callers that must preserve cross-partition rows should not use `update`.
	 *
	 * Exceptions thrown by `updater` are logged under the dedicated
	 * `FluidCacheUpdateCallbackError` telemetry event (distinct from IDB write errors)
	 * and surfaced to the caller as a `false` return value, after aborting the
	 * transaction so the existing row is preserved — even if `set` was called before
	 * the throw.
	 *
	 * Compare-and-set callers: a `false` return collapses three distinct outcomes —
	 * the updater returned without calling `set`, the updater threw (including the
	 * async-updater misuse case above), and the IDB write itself failed. Callers
	 * that need to distinguish these must consult telemetry: updater-side failures
	 * are logged under `FluidCacheUpdateCallbackError`; IDB-write failures are
	 * logged under `FluidCachePutError`. A lost compare-and-set race (the updater
	 * returned without calling `set`) is not logged.
	 * @returns `true` if `updater` called `set` and the write committed; `false` if
	 * `updater` returned without calling `set`, threw, or an IDB error occurred. IDB
	 * errors are logged and not thrown, matching the behavior of `put`.
	 */
	public async update(
		entry: ICacheEntry,
		updater: (existing: unknown, set: (value: unknown) => void) => void,
	): Promise<boolean> {
		let db: IDBPDatabase<FluidCacheDBSchema> | undefined;
		try {
			db = await this.openDb();

			const key = getKeyForCacheEntry(entry);
			const transaction = db.transaction(FluidDriverObjectStoreName, "readwrite");
			const existing = await transaction.store.get(key);
			// Surface the cached value to the updater only when the existing entry is
			// visible under the same rules `get` applies: same partition and not older
			// than `maxCacheItemAge`. Cross-partition and stale entries are treated as
			// absent so the updater sees the same view it would under `get`+`put`.
			const existingVisible =
				existing?.partitionKey === this.partitionKey &&
				Date.now() - existing.createdTimeMs <= this.maxCacheItemAge;
			const existingValue = existingVisible ? existing?.cachedObject : undefined;

			// `set` is a synchronous-only commit signal. We capture the last-supplied
			// value (multi-call: last wins) and a "called" flag so the value being set
			// to `undefined` still counts as a write. After `updater` returns we flip
			// `updaterReturned` to true; any subsequent `set` call throws a `UsageError`
			// at that call site so callers who try to defer the commit (e.g. from a
			// `setTimeout`) see the misuse rather than silently writing into a closed
			// transaction.
			let valueToWrite: unknown;
			let setCalled = false;
			let updaterReturned = false;
			const set = (value: unknown): void => {
				if (updaterReturned) {
					throw new UsageError("FluidCache.update: set called after updater returned");
				}
				valueToWrite = value;
				setCalled = true;
			};

			// Invoke the updater in its own try/catch so a host-supplied callback
			// throwing does not get logged under `FluidCachePutError` (which is for
			// IDB-write failures). On updater throw we abort the transaction so the
			// existing row is preserved — even if `set` was called before the throw —
			// log under the updater-specific event, and return `false` (matching the
			// documented "errors are logged, not thrown" contract).
			try {
				const updaterResult = updater(existingValue, set);
				updaterReturned = true;
				// Reject async updaters: TypeScript structurally accepts
				// `async (...) => Promise<void>` for the declared `() => void` parameter
				// type, but an async updater that calls `set` synchronously and then
				// awaits would let the IDB write commit before its eventual rejection
				// surfaced — contradicting the "throw aborts the transaction" contract.
				// Detect a thenable return and treat it as misuse symmetric with the
				// late-`set` guard.
				if (isPromiseLike(updaterResult)) {
					throw new UsageError(
						"FluidCache.update: updater must be synchronous (returned a thenable)",
					);
				}
			} catch (updaterError: any) {
				updaterReturned = true;
				transaction.abort();
				// Await transaction settlement; aborting causes `transaction.done` to
				// reject, which we swallow because the updater error is the real cause.
				await transaction.done.catch(() => {});
				this.logger.sendErrorEvent(
					{
						eventName: FluidCacheErrorEvent.FluidCacheUpdateCallbackError,
						pkgVersion,
					},
					updaterError,
				);
				return false;
			}

			if (!setCalled) {
				await transaction.done;
				return false;
			}

			// `set(undefined)` is treated as a delete: there is no useful distinction
			// between "no entry" and "entry stored as undefined" (both surface as
			// `undefined` from `get`), so we expose this as an atomic conditional-delete
			// rather than persisting an undefined-valued row that would otherwise
			// occupy IDB until maintenance reaped it.
			if (valueToWrite === undefined) {
				await transaction.store.delete(key);
			} else {
				const currentTime = Date.now();
				await transaction.store.put(
					{
						cachedObject: valueToWrite,
						fileId: entry.file.docId,
						type: entry.type,
						cacheItemId: entry.key,
						partitionKey: this.partitionKey,
						createdTimeMs: currentTime,
						lastAccessTimeMs: currentTime,
					},
					key,
				);
			}
			await transaction.done;
			return true;
		} catch (error: any) {
			this.logger.sendErrorEvent(
				{ eventName: FluidCacheErrorEvent.FluidCachePutError, pkgVersion },
				error,
			);
			return false;
		} finally {
			this.closeDb(db);
		}
	}
}
