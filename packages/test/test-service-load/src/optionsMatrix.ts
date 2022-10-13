/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerRuntimeOptions,
    IGCRuntimeOptions,
    ISummaryConfigurationHeuristics,
} from "@fluidframework/container-runtime";
import {
    booleanCases,
    generatePairwiseOptions,
    OptionsMatrix,
    numberCases,
} from "@fluidframework/test-pairwise-generator";
import { ILoaderOptions } from "@fluidframework/container-loader";
import { ConfigTypes, LoggingError } from "@fluidframework/telemetry-utils";

const loaderOptionsMatrix: OptionsMatrix<ILoaderOptions> = {
    cache: booleanCases,
    provideScopeLoader: booleanCases,
    maxClientLeaveWaitTime: numberCases,
    summarizeProtocolTree: [undefined],
};

export function applyOverrides<T>(options: OptionsMatrix<T>, optionsOverrides: Partial<OptionsMatrix<T>> | undefined) {
    const realOptions: OptionsMatrix<T> = { ...options };
    if (optionsOverrides !== undefined) {
        for (const key of Object.keys(optionsOverrides)) {
            const override = optionsOverrides[key];
            if (override !== undefined) {
                if (Array.isArray(override)) {
                    realOptions[key] = override;
                } else {
                    throw new LoggingError(`Override for ${key} is not array: ${JSON.stringify(optionsOverrides)}`);
                }
            }
        }
    }
    return realOptions;
}

export const generateLoaderOptions =
    (seed: number, overrides: Partial<OptionsMatrix<ILoaderOptions>> | undefined): ILoaderOptions[] => {
        return generatePairwiseOptions<ILoaderOptions>(
            applyOverrides(loaderOptionsMatrix, overrides),
            seed);
    };

const gcOptionsMatrix: OptionsMatrix<IGCRuntimeOptions> = {
    disableGC: booleanCases,
    gcAllowed: booleanCases,
    runFullGC: booleanCases,
    sweepAllowed: [false],
    sessionExpiryTimeoutMs: [undefined], // Don't want coverage here
};

const summaryConfigurationMatrix: OptionsMatrix<ISummaryConfigurationHeuristics> = {
    state: ["enabled"],
    minIdleTime: [0],
    maxIdleTime: [30 * 1000], // 30 secs.
    maxTime: [60 * 1000], // 1 min.
    maxOps: [100], // Summarize if 100 weighted ops received since last snapshot.
    minOpsForLastSummaryAttempt: [10],
    maxAckWaitTime: [10 * 60 * 1000], // 10 mins.
    maxOpsSinceLastSummary: [400, 800, 2000],
    initialSummarizerDelayMs: [2, 2500, 6000],
    summarizerClientElection: booleanCases,
    nonRuntimeOpWeight: [0.1],
    runtimeOpWeight: [1.0],
};

export function generateRuntimeOptions(
    seed: number, overrides: Partial<OptionsMatrix<IContainerRuntimeOptions>> | undefined) {
    const gcOptions =
        generatePairwiseOptions(applyOverrides(gcOptionsMatrix, overrides?.gcOptions as any), seed);

    const summaryOptionsMatrixOptions =
        generatePairwiseOptions(summaryConfigurationMatrix, seed);

    const newSummaryOptions = summaryOptionsMatrixOptions.map((option) => {
            return { summaryConfigOverrides: option };
    });

    const runtimeOptionsMatrix: OptionsMatrix<IContainerRuntimeOptions> = {
        gcOptions: [undefined, ...gcOptions],
        summaryOptions: [undefined, ...newSummaryOptions],
        loadSequenceNumberVerification: [undefined],
        enableOfflineLoad: [undefined],
        flushMode: [undefined],
        compressionOptions: [{ minimumSize: 500 }],
        maxBatchSizeInBytes: [undefined],
    };

    return generatePairwiseOptions<IContainerRuntimeOptions>(
        applyOverrides(
            runtimeOptionsMatrix,
            { ...overrides, gcOptions: undefined, summaryOptions: undefined }),
        seed);
}

export function generateConfigurations(
    seed: number, overrides: OptionsMatrix<Record<string, ConfigTypes>> | undefined,
): Record<string, ConfigTypes>[] {
    if (overrides === undefined) {
        return [{}];
    }
    return generatePairwiseOptions<Record<string, ConfigTypes>>(
        overrides,
        seed);
}
