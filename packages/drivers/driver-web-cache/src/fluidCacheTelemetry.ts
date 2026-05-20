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
	"FluidCacheDeleteSingleEntryError" = "FluidCacheDeleteSingleEntryError",
	"FluidCacheGetError" = "FluidCacheGetError",
	"FluidCachePutError" = "FluidCachePutError",
	"FluidCacheUpdateUsageError" = "FluidCacheUpdateUsageError",
	"FluidCacheDeleteOldDbError" = "FluidCacheDeleteOldDbError",
	"FluidCacheBroadcastError" = "FluidCacheBroadcastError",
	"FluidCacheChangeListenerError" = "FluidCacheChangeListenerError",
}

export const enum FluidCacheEventSubCategories {
	"FluidCache" = "FluidCache",
}
