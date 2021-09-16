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
     * Number of clients sending blobs. Each of these will send one blob per cycle.
     */
    numBlobClients?: number,
    /**
     * Size of blob to upload in bytes. Note that some services may limit the maximum uploadable blob size (e.g. 4MB in
     * ODSP). Also, keep in mind that large blob uploads will likely dwarf other observable effects.
     */
    blobSize?: number,
}
