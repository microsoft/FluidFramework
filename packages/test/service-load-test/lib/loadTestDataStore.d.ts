/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { ILoadTestConfig } from "./testConfigFile";
export interface IRunConfig {
    runId: number;
    testConfig: ILoadTestConfig;
}
export interface ILoadTest {
    run(config: IRunConfig): Promise<void>;
}
export declare const fluidExport: ContainerRuntimeFactoryWithDefaultDataStore;
//# sourceMappingURL=loadTestDataStore.d.ts.map