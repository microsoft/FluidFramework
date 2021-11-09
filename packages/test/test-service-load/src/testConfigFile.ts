/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** Type modeling the structure of the testConfig.json file */
export interface ITestConfig {
    profiles: { [name: string]: ILoadTestConfig | undefined };
}

/** Type modeling the profile sub-structure of the testConfig.json file */
export interface ILoadTestConfig {
    opRatePerMin: number,
    progressIntervalMs: number,
    numClients: number,
    totalSendCount: number,
    readWriteCycleMs: number,
    faultInjectionMaxMs?: number,
    faultInjectionMinMs?: number,
    /**
     * Number of "attachment" type blobs to upload over the course of the test run.
     */
    totalBlobCount?: number,
    /**
     * Size of blob to upload in bytes. Note that some services may limit the maximum uploadable blob size (e.g. 4MB in
     * ODSP).
     */
    blobSize?: number,
    /**
     * Number of "attachment" type blobs to add while detached. Note this is only supported on ODSP currently.
     */
    detachedBlobCount?: number,
}
