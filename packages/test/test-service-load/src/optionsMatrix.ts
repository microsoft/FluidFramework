/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILoaderOptions  } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, IGCRuntimeOptions, ISummaryRuntimeOptions } from "@fluidframework/container-runtime";
import {
    booleanCases,
    generatePairwiseOptions,
    OptionsMatrix,
    numberCases,
} from "@fluidframework/test-pairwise-generator";

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

export function generateRuntimeOptions(seed: number) {
    const summaryOptionsMatrix: OptionsMatrix<ISummaryRuntimeOptions> = {
        disableIsolatedChannels: booleanCases,
        generateSummaries: booleanCases,
        initialSummarizerDelayMs: numberCases,
        summaryConfigOverrides:[undefined],
        maxOpsSinceLastSummary: numberCases,
    };

    type OptionsUnderTest = Pick<IContainerRuntimeOptions, "gcOptions" | "summaryOptions">;

    const runtimeOptionsMatrix: OptionsMatrix<OptionsUnderTest> = {
        gcOptions: [undefined, ...generatePairwiseOptions(gcOptionsMatrix, seed)],
        summaryOptions: [undefined, ...generatePairwiseOptions(summaryOptionsMatrix, seed)],
    };

    return generatePairwiseOptions<OptionsUnderTest>(runtimeOptionsMatrix, seed);
}
