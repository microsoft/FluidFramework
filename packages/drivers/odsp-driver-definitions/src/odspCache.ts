/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Describes what kind of content is stored in cache entry.
 * @internal
 */
export const snapshotKey = "snapshot";

/**
 * Describes key for partial snapshot with loading GroupId in cache entry.
 * @internal
 */
export const snapshotWithLoadingGroupIdKey = "snapshotWithLoadingGroupId";

/**
 * @legacy @beta
 */
export type CacheContentType = "snapshot" | "ops" | "snapshotWithLoadingGroupId";
