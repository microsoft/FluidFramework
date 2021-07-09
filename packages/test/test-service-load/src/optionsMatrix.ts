/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerRuntimeOptions,
    IGCRuntimeOptions,
    ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime";
import {
    booleanCases,
    generatePairwiseOptions,
    OptionsMatrix,
    numberCases,
} from "@fluidframework/test-pairwise-generator";
import { ILoaderOptions } from "@fluidframework/container-loader";

const loaderOptionsMatrix: OptionsMatrix<ILoaderOptions> = {
    cache: booleanCases,
    provideScopeLoader: booleanCases,
    maxClientLeaveWaitTime: numberCases,
    noopCountFrequency: numberCases,
    noopTimeFrequency: numberCases,
    summarizeProtocolTree: [undefined],
};

export const generateLoaderOptions = (seed: number): ILoaderOptions[]=>
    generatePairwiseOptions<ILoaderOptions>(
        loaderOptionsMatrix,
        seed);

const gcOptionsMatrix: OptionsMatrix<IGCRuntimeOptions> = {
    disableGC: booleanCases,
    gcAllowed: booleanCases,
    runFullGC: booleanCases,
};

export function generateRuntimeOptions(seed: number) {
    const summaryOptionsMatrix: OptionsMatrix<ISummaryRuntimeOptions> = {
        disableIsolatedChannels: booleanCases,
        generateSummaries: [true],
        initialSummarizerDelayMs: numberCases,
        summaryConfigOverrides: [undefined],
        maxOpsSinceLastSummary: numberCases,
        summarizerClientElection: booleanCases,
    };

    // Using an Omit here such that when new options are added, it is required to either explicitly omit them from
    // the stress test matrix or else define the options matrix.
    type OptionsUnderTest = Omit<IContainerRuntimeOptions, "addGlobalAgentSchedulerAndLeaderElection">;

    const runtimeOptionsMatrix: OptionsMatrix<OptionsUnderTest> = {
        gcOptions: [undefined, ...generatePairwiseOptions(gcOptionsMatrix, seed)],
        summaryOptions: [undefined, ...generatePairwiseOptions(summaryOptionsMatrix, seed)],
    };

    return generatePairwiseOptions<OptionsUnderTest>(runtimeOptionsMatrix, seed);
}
