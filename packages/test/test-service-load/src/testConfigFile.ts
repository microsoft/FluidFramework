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
    noFaultInjection: boolean,
}
