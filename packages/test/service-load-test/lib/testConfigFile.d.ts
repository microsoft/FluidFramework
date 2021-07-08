/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/** Type modeling the structure of the testConfig.json file */
export interface ITestConfig {
    tenants: {
        [friendlyName: string]: ITestTenant | undefined;
    };
    profiles: {
        [name: string]: ILoadTestConfig | undefined;
    };
}
/** Type modeling the tenant sub-structure of the testConfig.json file */
export interface ITestTenant {
    server: string;
    username: string;
}
/** Type modeling the profile sub-structure of the testConfig.json file */
export interface ILoadTestConfig {
    opRatePerMin: number;
    progressIntervalMs: number;
    numClients: number;
    totalSendCount: number;
    readWriteCycleMs: number;
}
//# sourceMappingURL=testConfigFile.d.ts.map