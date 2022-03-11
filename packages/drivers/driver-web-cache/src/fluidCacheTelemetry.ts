/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const enum FluidCacheGenericEvent {
    "FluidCacheStorageInfo" = "FluidCacheStorageInfo",
    "FluidCachePartitionKeyMismatch" = "FluidCachePartitionKeyMismatch",
}

export const enum FluidCacheErrorEvent {
    "FluidCacheDeleteOldEntriesError" = "FluidCacheDeleteOldEntriesError",
    "FluidCacheGetError" = "FluidCacheGetError",
    "FluidCachePutError" = "FluidCachePutError",
    "FluidCacheUpdateUsageError" = "FluidCacheUpdateUsageError",
    "FluidCacheDeleteOldDbError" = "FluidCacheDeleteOldDbError",
}

export const enum FluidCacheEventSubCategories {
    "FluidCache" = "FluidCache",
}
