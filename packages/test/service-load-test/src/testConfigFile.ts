/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/** Type modeling the structure of the testConfig.json file */
export interface ITestConfig {
    profiles: { [name: string]: ILoadTestConfig | undefined };
}

<<<<<<< HEAD
=======
/** Type modeling the tenant sub-structure of the testConfig.json file */
export interface ITestTenant {
    server: string,
    username: string,
    driveId: string,
}

>>>>>>> 8101ce309be0ecd996911cd33a69f4fcdc8e1f74
/** Type modeling the profile sub-structure of the testConfig.json file */
export interface ILoadTestConfig {
    opRatePerMin: number,
    progressIntervalMs: number,
    numClients: number,
    totalSendCount: number,
    readWriteCycleMs: number,
}
