/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ILoaderOptions  } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, IGCRuntimeOptions, ISummaryRuntimeOptions } from "@fluidframework/container-runtime";
import {
    booleanCases,
    generatePairwiseOptions,
    OptionsMatrix,
    numberCases,
} from "@fluid-internal/test-pairwise-generator";
import { Lazy } from "@fluidframework/common-utils";

const loaderOptionsMatrix: OptionsMatrix<ILoaderOptions> = {
    cache: booleanCases,
    hotSwapContext: booleanCases,
    provideScopeLoader: booleanCases,
    maxClientLeaveWaitTime: numberCases,
    noopCountFrequency: numberCases,
    noopTimeFrequency: numberCases,
};

export const pairwiseLoaderOptions = new Lazy(()=>
    generatePairwiseOptions<ILoaderOptions>(loaderOptionsMatrix));

const gcOptionsMatrix: OptionsMatrix<IGCRuntimeOptions> = {
    disableGC: booleanCases,
    gcAllowed: booleanCases,
    runFullGC: booleanCases,
};

const summaryConfigurationMatrix: OptionsMatrix<Partial<ISummaryConfiguration>> = {
    idleTime: numberCases,
    maxAckWaitTime: numberCases,
    maxOps: numberCases,
    maxTime: numberCases,
};

const summaryOptionsMatrix: OptionsMatrix<ISummaryRuntimeOptions> = {
    disableIsolatedChannels: booleanCases,
    generateSummaries: booleanCases,
    initialSummarizerDelayMs: numberCases,
    summaryConfigOverrides:[undefined, summaryConfigurationMatrix],
};

const runtimeOptionsMatrix: OptionsMatrix<IContainerRuntimeOptions> = {
    gcOptions: [undefined, gcOptionsMatrix],
    summaryOptions: [undefined, summaryOptionsMatrix],
};

export const pairwiseRuntimeOptions = new Lazy<IContainerRuntimeOptions[]>(()=>
    generatePairwiseOptions<IContainerRuntimeOptions>(runtimeOptionsMatrix));
