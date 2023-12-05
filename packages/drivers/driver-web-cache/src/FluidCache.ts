/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDBPDatabase } from "idb";
import { assert } from "@fluidframework/core-utils";
import { IPersistedCache, ICacheEntry, IFileEntry } from "@fluidframework/odsp-driver-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import { scheduleIdleTask } from "./scheduleIdleTask";
import {
	getFluidCacheIndexedDbInstance,
	FluidCacheDBSchema,
	FluidDriverObjectStoreName,
	getKeyForCacheEntry,
} from "./FluidCacheIndexedDb";
import {
	FluidCacheErrorEvent,
	FluidCacheEventSubCategories,
	FluidCacheGenericEvent,
} from "./fluidCacheTelemetry";
import { pkgVersion } from "./packageVersion";

// Some browsers have a usageDetails property that will tell you more detailed information
// on how the storage is being used
interface StorageQuotaUsageDetails {
	indexedDB: number | undefined;
}

/**
 * @alpha
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
 * @alpha
 */
export class FluidCache implements IPersistedCache {
	private readonly logger: ITelemetryLoggerExt;

	private readonly partitionKey: string | null;

	private readonly maxCacheItemAge: number;
	private readonly closeDbImmediately: boolean = true;
	private readonly closeDbAfterMs: number;
	private db: IDBPDatabase<FluidCacheDBSchema> | undefined;
	private dbCloseTimer: ReturnType<typeof setTimeout> | undefined;
	private dbReuseCount: number = -1;

	constructor(config: FluidCacheConfig) {
		this.logger = createChildLogger({ logger: config.logger });
		this.partitionKey = config.partitionKey;
		this.maxCacheItemAge = config.maxCacheItemAge;
		this.closeDbAfterMs = config.closeDbAfterMs ?? 0;
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
					IDBKeyRange.upperBound(new Date().getTime() - this.maxCacheItemAge),
				);

				await Promise.all(keysToDelete.map((key) => transaction.store.delete(key)));
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

	private async openDb() {
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

	private closeDb(db?: IDBPDatabase<FluidCacheDBSchema>) {
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

			await Promise.all(keysToDelete.map((key) => transaction.store.delete(key)));
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return cachedItem?.cachedObject;
	}

	private async getItemFromCache(cacheEntry: ICacheEntry) {
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

			const currentTime = new Date().getTime();

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

			const currentTime = new Date().getTime();

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
}
