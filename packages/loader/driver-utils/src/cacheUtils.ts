/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FiveDaysMs, ICacheEntry } from "@fluidframework/driver-definitions/internal";

/**
 * Must be less than IDocumentStorageServicePolicies.maximumCacheDurationMs policy of 5 days.
 * That policy is the outward expression and this value is the implementation - using a larger value
 * would violate that statement of the driver's behavior.
 * Other parts of the system (such as Garbage Collection) depend on that policy being properly implemented.
 *
 * @internal
 */
export const maximumCacheDurationMs: FiveDaysMs = 432_000_000; // 5 days in ms

/**
 * Api to generate a cache key from cache entry.
 * @param entry - cache entry from which a cache key is generated
 * @returns The key for cache.
 * @internal
 */
export function getKeyForCacheEntry(entry: ICacheEntry): string {
	const version = entry.file.fileVersion !== undefined ? `_${entry.file.fileVersion}` : "";
	return `${entry.file.docId}${version}_${entry.type}_${entry.key}`;
}
