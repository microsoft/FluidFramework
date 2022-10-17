/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoaderOptions } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { ConfigTypes } from "@fluidframework/telemetry-utils";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { OptionsMatrix } from "@fluidframework/test-pairwise-generator";

/** Type modeling the structure of the testConfig.json file */
export interface ITestConfig {
    profiles: { [name: string]: ILoadTestConfig | undefined; };
}

/** Type modeling the profile sub-structure of the testConfig.json file */
export interface ILoadTestConfig {
    opRatePerMin: number;
    progressIntervalMs: number;
    numClients: number;
    totalSendCount: number;
    totalSignalsSendCount?: number;
    readWriteCycleMs: number;
    signalsPerMin?: number;
    faultInjectionMaxMs?: number;
    faultInjectionMinMs?: number;
    opsSendType?: string;
    /**
     * Number of "attachment" type blobs to upload over the course of the test run.
     */
    totalBlobCount?: number;
    /**
     * Size of blob to upload in bytes. Note that some services may limit the maximum uploadable blob size (e.g. 4MB in
     * ODSP).
     */
    blobSize?: number;
    /**
     * Number of "attachment" type blobs to add while detached. Note this is only supported on ODSP currently.
     */
    detachedBlobCount?: number;

    /**
     * Override loader options to force a specific value
     */
    optionOverrides?: Record<TestDriverTypes, OptionOverride | undefined>;
}

export interface OptionOverride{
    loader?: Partial<OptionsMatrix<ILoaderOptions>>;
    container?: Partial<OptionsMatrix<IContainerRuntimeOptions>>;
    configurations?: OptionsMatrix<Record<string, ConfigTypes>>;
}
