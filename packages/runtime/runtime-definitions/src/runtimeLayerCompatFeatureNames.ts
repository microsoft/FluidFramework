/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This feature indicates the ContainerRuntime will encode handles
 * If the Runtime layer supports this feature, the DataStore layer should not encode handles (but do bind them)
 *
 * @internal
 */
export const encodeHandlesInContainerRuntime = "encodeHandlesInContainerRuntime";

/**
 * This feature indicates that the datastore context will call notifyReadOnlyState on the
 * datastore runtime.
 * @internal
 */
export const notifiesReadOnlyState = "notifiesReadOnlyState";

/**
 * This feature indicates that the container runtime provides per-DDS GC access checks and deletion tracking through `channelGC` for documents with independent DDS collection enabled.
 * It also dispatches sweep decisions as data-store-relative DDS root paths.
 * @internal
 */
export const providesChannelGC = "providesChannelGC";

/**
 * This feature indicates that the data store runtime implements the internal `deleteSweepReadyNodes` hook for data-store-relative DDS root paths.
 * It also preserves named DDS root markers in summaries and attach snapshots.
 * @internal
 */
export const supportsChannelDeletion = "supportsChannelDeletion";
