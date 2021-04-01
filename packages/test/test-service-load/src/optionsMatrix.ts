/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ILoaderOptions  } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, IGCRuntimeOptions, ISummaryRuntimeOptions } from "@fluidframework/container-runtime";
import { booleanCases, OptionsMatrix, undefinedCases } from "@fluid-internal/test-pairwise-generator";

export const loaderOptionsMatrix: OptionsMatrix<ILoaderOptions> = {
    cache: booleanCases,
    hotSwapContext: booleanCases,
    provideScopeLoader: booleanCases,
    maxClientLeaveWaitTime: undefinedCases,
    noopCountFrequency: undefinedCases,
    noopTimeFrequency: undefinedCases,
};

export const gcOptionsMatrix: OptionsMatrix<IGCRuntimeOptions> = {
    disableGC: booleanCases,
    gcAllowed: booleanCases,
    runFullGC: booleanCases,
};

export const summaryConfigurationMatrix: OptionsMatrix<Partial<ISummaryConfiguration>> = {
    idleTime: undefinedCases,
    maxAckWaitTime: undefinedCases,
    maxOps: undefinedCases,
    maxTime: undefinedCases,
};

export const summaryOptionsMatrix: OptionsMatrix<ISummaryRuntimeOptions> = {
    disableIsolatedChannels: booleanCases,
    generateSummaries: booleanCases,
    initialSummarizerDelayMs: undefinedCases,
    summaryConfigOverrides:[undefined, summaryConfigurationMatrix],
};

export const runtimeOptionsMatrix: OptionsMatrix<IContainerRuntimeOptions> = {
    gcOptions: [undefined, gcOptionsMatrix],
    summaryOptions: [undefined, summaryOptionsMatrix],
};
