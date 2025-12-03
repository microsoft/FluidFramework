/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export enum FluidCacheGenericEvent {
	FluidCacheStorageInfo = "FluidCacheStorageInfo",
	FluidCachePartitionKeyMismatch = "FluidCachePartitionKeyMismatch",
}

export enum FluidCacheErrorEvent {
	FluidCacheDeleteOldEntriesError = "FluidCacheDeleteOldEntriesError",
	FluidCacheGetError = "FluidCacheGetError",
	FluidCachePutError = "FluidCachePutError",
	FluidCacheUpdateUsageError = "FluidCacheUpdateUsageError",
	FluidCacheDeleteOldDbError = "FluidCacheDeleteOldDbError",
}

export enum FluidCacheEventSubCategories {
	FluidCache = "FluidCache",
}
