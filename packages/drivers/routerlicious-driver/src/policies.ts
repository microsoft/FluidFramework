/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export enum RouterliciousDriverPerformanceEventName {
    getVersions = "getVersions",
    readBlob = "readBlob",
    // Shredded summaries
    getSnapshotTree = "getSnapshotTree",
    // Whole summaries
    getWholeFlatSummaryTree = "getWholeFlatSummaryTree",
}
/**
 * Number of [eventName] performance events to aggregate into 1 event.
 * Setting as undefined will disable aggregation for [eventName] events.
 * Example: { readBlob: 100 } will aggregate every 100 readBlob events into 1 event and log it.
 */
type ITelemetryAggregationPolicy = Partial<Record<RouterliciousDriverPerformanceEventName, number | undefined>>;

/**
 * Policies configurable by Routerlicious Driver consumer.
 */
export interface IRouterliciousDriverPolicies {
    /**
     * Enable prefetching entire snapshot tree into memory before it is loaded by the runtime.
     * Default: true
     */
    enablePrefetch: boolean;
    /**
     * Rate limit concurrent storage requests.
     * Default: 100
     */
    maxConcurrentStorageRequests: number;
    /**
     * Rate limit concurrent orderer requests.
     * Default: 100
     */
    maxConcurrentOrdererRequests: number;
    /**
     * Give hosts the option to change blob aggregation behavior to suit their needs.
     * Larger number means fewer blob individual requests, but less blob-deduping.
     * Smaller number means more blob individual requests, but more blob-deduping.
     * Setting to `undefined` disables blob aggregration.
     * Default: undefined
     */
    aggregateBlobsSmallerThanBytes: number | undefined;
    /**
     * Enable uploading entire summary tree as a IWholeSummaryPayload to storage.
     * Default: false
     */
    enableWholeSummaryUpload: boolean;
    /**
     * Enable using RestLess which avoids CORS preflight requests.
     * Default: false
     */
    enableRestLess: boolean;
    /**
     * Configure if/how performance telemetry events are aggregated. Useful for reducing telemetry noise.
     * Do not use if per-event data examination is needed.
     * Aggregated will be logged as total sums along with a total count.
     * Default: undefined
     */
    telemetryAggregation: ITelemetryAggregationPolicy | undefined;
}
