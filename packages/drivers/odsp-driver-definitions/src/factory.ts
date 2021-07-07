/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ISnapshotOptions {
    blobs?: number;
    deltas?: number;
    channels?: number;
    /*
     * Maximum Data size (in bytes)
     * If specified, SPO will fail snapshot request with 413 error (see OdspErrorType.snapshotTooBig)
     * if snapshot is bigger in size than specified limit.
     */
    mds?: number;

    /*
     * Maximum time limit to fetch snapshot (in seconds)
     * If specified, client will timeout the fetch request if it exceeds the time limit and
     * will try to fetch the snapshot without blobs.
     */
    timeout?: number;
}

export interface IOpsCachingPolicy {
    /**
     * Batch size. Controls how many ops are grouped together as single cache entry
     * The bigger the number, the more efficient it is (less reads & writes)
     * At the same time, big number means we wait for so many ops to accumulate, which
     * increases chances and number of trailing ops that would not be flushed to cache
     * when user closes tab
     * Use any number below 1 to disable caching
     * Default: 100
     */
    batchSize?: number;

    /**
     * To reduce the problem of losing trailing ops when using big batch sizes, host
     * could specify how often driver should flush ops it has not flushed yet.
     * -1 means do not use timer.
     * Measured in ms.
     * Default: 5000
     */
    timerGranularity?: number,

    /**
     * Total number of ops to cache. When we reach that number, ops caching stops
     * Default: 5000
     */
    totalOpsToCache?: number;
}

export interface ICollabSessionOptions {
    /**
     * Value indicating the display name for session that admits unauthenticated user.
     * This name will be used in attribution associated with edits made by such user.
     */
     unauthenticatedUserDisplayName?: string;
}

export interface HostStoragePolicy {
    snapshotOptions?: ISnapshotOptions;

    /**
     * If set to true, tells driver to concurrently fetch snapshot from storage (SPO) and cache
     * Container loads from whatever comes first in such case.
     * Snapshot fetched from storage is pushed to cache in either case.
     * If set to false, driver will first consult with cache. Only on cache miss (cache does not
     * return snapshot), driver will fetch snapshot from storage (and push it to cache), otherwise
     * it will load from cache and not reach out to storage.
     * Passing true results in faster loads and keeping cache more current, but it increases bandwidth consumption.
     */
    concurrentSnapshotFetch?: boolean;

    // Options overwriting default ops fetching from storage.
    opsBatchSize?: number;
    concurrentOpsBatches?: number;

    /**
     * Policy controlling ops caching (leveraging IPersistedCache passed to driver factory)
     */
    opsCaching?: IOpsCachingPolicy;

    /**
     * Policy controlling how collaboration session is established
     */
    sessionOptions?: ICollabSessionOptions;

    // True to have the sharing link redeem fallback in case the Trees Latest/Redeem 1RT call fails with redeem error.
    // During fallback it will first redeem the sharing link and then make the Trees latest call.
    enableRedeemFallback?: boolean;
}
