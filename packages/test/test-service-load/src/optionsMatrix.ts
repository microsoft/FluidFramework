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

const loaderOptionsMatrix: OptionsMatrix<ILoaderOptions> = {
    cache: booleanCases,
    provideScopeLoader: booleanCases,
    maxClientLeaveWaitTime: numberCases,
    noopCountFrequency: numberCases,
    noopTimeFrequency: numberCases,
};

export const generateLoaderOptions = (seed: number)=>
    generatePairwiseOptions<ILoaderOptions>(loaderOptionsMatrix, seed);

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

export function generateRuntimeOptions(seed: number) {
    const summaryOptionsMatrix: OptionsMatrix<ISummaryRuntimeOptions> = {
        disableIsolatedChannels: booleanCases,
        generateSummaries: booleanCases,
        initialSummarizerDelayMs: numberCases,
        summaryConfigOverrides:[undefined, ...generatePairwiseOptions(summaryConfigurationMatrix, seed)],
    };

    const runtimeOptionsMatrix: OptionsMatrix<IContainerRuntimeOptions> = {
        gcOptions: [undefined, ...generatePairwiseOptions(gcOptionsMatrix, seed)],
        summaryOptions: [undefined, ...generatePairwiseOptions(summaryOptionsMatrix, seed)],
    };

    return generatePairwiseOptions<IContainerRuntimeOptions>(runtimeOptionsMatrix, seed);
}
