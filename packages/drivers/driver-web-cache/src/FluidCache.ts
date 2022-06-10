/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IPersistedCache,
    ICacheEntry,
    IFileEntry,
} from "@fluidframework/odsp-driver-definitions";
import {
    ITelemetryBaseLogger,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { scheduleIdleTask } from "./scheduleIdleTask";
import {
    getFluidCacheIndexedDbInstance,
    FluidDriverObjectStoreName,
    getKeyForCacheEntry,
} from "./FluidCacheIndexedDb";
import {
    FluidCacheErrorEvent,
    FluidCacheEventSubCategories,
    FluidCacheGenericEvent,
} from "./fluidCacheTelemetry";

// Some browsers have a usageDetails property that will tell you more detailed information
// on how the storage is being used
interface StorageQuotaUsageDetails {
    indexedDB: number | undefined;
}

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
}

/**
 * A cache that can be used by the Fluid ODSP driver to cache data for faster performance
 */
export class FluidCache implements IPersistedCache {
    private readonly logger: ITelemetryLogger;

    private readonly partitionKey: string | null;

    private readonly maxCacheItemAge: number;

    constructor(config: FluidCacheConfig) {
        this.logger = ChildLogger.create(config.logger);
        this.partitionKey = config.partitionKey;
        this.maxCacheItemAge = config.maxCacheItemAge;

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
                    indexedDBSize = (
                        (estimate as any)
                            .usageDetails as StorageQuotaUsageDetails
                    ).indexedDB;
                }

                this.logger.sendTelemetryEvent({
                    eventName: FluidCacheGenericEvent.FluidCacheStorageInfo,
                    subCategory: FluidCacheEventSubCategories.FluidCache,
                    quota: estimate.quota,
                    usage: estimate.usage,
                    indexedDBSize,
                });
            }
        });

        scheduleIdleTask(async () => {
            // Delete entries that have not been accessed recently to clean up space
            try {
                const db = await getFluidCacheIndexedDbInstance(this.logger);

                const transaction = db.transaction(
                    FluidDriverObjectStoreName,
                    "readwrite",
                );
                const index = transaction.store.index("lastAccessTimeMs");
                // Get items that have not been accessed in 4 weeks
                const keysToDelete = await index.getAllKeys(
                    IDBKeyRange.upperBound(
                        new Date().getTime() - 4 * 7 * 24 * 60 * 60 * 1000,
                    ),
                );

                await Promise.all(
                    keysToDelete.map((key) => transaction.store.delete(key)),
                );
                await transaction.done;
            } catch (error: any) {
                this.logger.sendErrorEvent(
                    {
                        eventName:
                            FluidCacheErrorEvent.FluidCacheDeleteOldEntriesError,
                    },
                    error,
                );
            }
        });
    }

    public async removeEntries(file: IFileEntry): Promise<void> {
        try {
            const db = await getFluidCacheIndexedDbInstance(this.logger);

            const transaction = db.transaction(
                FluidDriverObjectStoreName,
                "readwrite",
            );
            const index = transaction.store.index("fileId");

            const keysToDelete = await index.getAllKeys(file.docId);

            await Promise.all(
                keysToDelete.map((key) => transaction.store.delete(key)),
            );
            await transaction.done;
        } catch (error: any) {
            this.logger.sendErrorEvent(
                {
                    eventName:
                        FluidCacheErrorEvent.FluidCacheDeleteOldEntriesError,
                },
                error,
            );
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
        });

        // Value will contain metadata like the expiry time, we just want to return the object we were asked to cache
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return cachedItem?.cachedObject;
    }

    private async getItemFromCache(cacheEntry: ICacheEntry) {
        try {
            const key = getKeyForCacheEntry(cacheEntry);

            const db = await getFluidCacheIndexedDbInstance(this.logger);

            const value = await db.get(FluidDriverObjectStoreName, key);

            if (!value) {
                return undefined;
            }

            // If the data does not come from the same partition, don't return it
            if (value.partitionKey !== this.partitionKey) {
                this.logger.sendTelemetryEvent({
                    eventName:
                        FluidCacheGenericEvent.FluidCachePartitionKeyMismatch,
                    subCategory: FluidCacheEventSubCategories.FluidCache,
                });

                return undefined;
            }

            const currentTime = new Date().getTime();

            // If too much time has passed since this cache entry was used, we will also return undefined
            if (currentTime - value.createdTimeMs > this.maxCacheItemAge) {
                return undefined;
            }

            const transaction = db.transaction(
                FluidDriverObjectStoreName,
                "readwrite",
            );
            // We don't want to block the get return of this function on updating the last accessed time
            // We catch this promise because there is no user bad if this is rejected.
            transaction.store
                .get(key)
                .then(async (valueToUpdate) => {
                    // This value in the database could have been updated concurrently by other tabs/iframes
                    // since we first read it. Only update the last accessed time if the current value in the
                    // DB was the same one we returned.
                    if (
                        valueToUpdate !== undefined &&
                        valueToUpdate.createdTimeMs === value.createdTimeMs &&
                        (valueToUpdate.lastAccessTimeMs === undefined ||
                            valueToUpdate.lastAccessTimeMs < currentTime)
                    ) {
                        await transaction.store.put(
                            { ...valueToUpdate, lastAccessTimeMs: currentTime },
                            key,
                        );
                    }
                    await transaction.done;

                    db.close();
                })
                .catch(() => { });
            return value;
        } catch (error: any) {
            // We can fail to open the db for a variety of reasons,
            // such as the database version having upgraded underneath us. Return undefined in this case
            this.logger.sendErrorEvent(
                { eventName: FluidCacheErrorEvent.FluidCacheGetError },
                error,
            );
            return undefined;
        }
    }

    public async put(entry: ICacheEntry, value: any): Promise<void> {
        try {
            const db = await getFluidCacheIndexedDbInstance(this.logger);

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

            db.close();
        } catch (error: any) {
            // We can fail to open the db for a variety of reasons,
            // such as the database version having upgraded underneath us
            this.logger.sendErrorEvent(
                { eventName: FluidCacheErrorEvent.FluidCachePutError },
                error,
            );
        }
    }
}
