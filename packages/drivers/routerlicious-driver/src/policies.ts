/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
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
     * Enable service endpoint discovery when creating or joining a session.
     * Default: false
     */
    enableDiscovery?: boolean;
    /**
     * Enable using RestLess which avoids CORS preflight requests.
     * Default: true
     */
    enableRestLess: boolean;
    /**
     * Enable internal cache of summaries/snapshots.
     * Reduces Summarizer boot time and reduces server load in E2E tests.
     * Default: true
     */
    enableInternalSummaryCaching: boolean;
}
