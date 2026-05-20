/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const enum FluidCacheGenericEvent {
	"FluidCacheStorageInfo" = "FluidCacheStorageInfo",
	"FluidCachePartitionKeyMismatch" = "FluidCachePartitionKeyMismatch",
	"FluidCacheBroadcastChannelUnavailable" = "FluidCacheBroadcastChannelUnavailable",
}

export const enum FluidCacheErrorEvent {
	"FluidCacheDeleteOldEntriesError" = "FluidCacheDeleteOldEntriesError",
	"FluidCacheDeleteSingleEntryError" = "FluidCacheDeleteSingleEntryError",
	"FluidCacheGetError" = "FluidCacheGetError",
	"FluidCachePutError" = "FluidCachePutError",
	"FluidCachePutIfPredicateError" = "FluidCachePutIfPredicateError",
	"FluidCacheUpdateUsageError" = "FluidCacheUpdateUsageError",
	"FluidCacheDeleteOldDbError" = "FluidCacheDeleteOldDbError",
	"FluidCacheBroadcastError" = "FluidCacheBroadcastError",
}

export const enum FluidCacheEventSubCategories {
	"FluidCache" = "FluidCache",
}
