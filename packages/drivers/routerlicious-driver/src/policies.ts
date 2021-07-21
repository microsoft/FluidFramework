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
}
