/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    OdspDocumentServiceFactory,
    createOdspCreateContainerRequest,
    createOdspUrl,
    OdspDriverUrlResolver,
} from "@fluidframework/odsp-driver";
import {
    HostStoragePolicy,
    ISnapshotOptions,
    IOpsCachingPolicy,
} from "@fluidframework/odsp-driver-definitions";
import {
    booleanCases,
    generatePairwiseOptions,
    OptionsMatrix,
    numberCases,
 } from "@fluid-internal/test-pairwise-generator";
import { pkgVersion } from "./packageVersion";

export const OdspDriverApi = {
    version: pkgVersion,
    OdspDocumentServiceFactory,
    OdspDriverUrlResolver,
    createOdspCreateContainerRequest,
    createOdspUrl,                          // REVIEW: does this need to be back compat?
};

export type OdspDriverApiType = typeof OdspDriverApi;

const odspSnapshotOptions: OptionsMatrix<ISnapshotOptions> = {
    blobs: numberCases,
    channels: numberCases,
    deltas: numberCases,
    mds: numberCases,
    timeout: numberCases,
};

const odspOpsCaching: OptionsMatrix<IOpsCachingPolicy> = {
    batchSize: [undefined, -1],
    timerGranularity: numberCases,
    totalOpsToCache: numberCases,
};

export const generateOdspHostStoragePolicy = (seed: number)=> {
    const odspHostPolicyMatrix: OptionsMatrix<HostStoragePolicy> = {
        blobDeduping: booleanCases,
        concurrentSnapshotFetch: booleanCases,
        opsBatchSize: numberCases,
        concurrentOpsBatches: numberCases,
        snapshotOptions:[undefined, ...generatePairwiseOptions(odspSnapshotOptions, seed)],
        opsCaching: [undefined, ...generatePairwiseOptions(odspOpsCaching, seed)],
    };
    return generatePairwiseOptions<HostStoragePolicy>(odspHostPolicyMatrix, seed);
};
