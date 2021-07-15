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
     * Give hosts the option to change blob aggregation behavior to suit their needs.
     * Larger number means fewer blob individual requests, but less blob-deduping.
     * Smaller number means more blob individual requests, but more blob-deduping.
     * Setting to `undefined` disables blob aggregration.
     * Default: 2048
     */
    aggregateBlobsSmallerThanBytes: number | undefined;
}
