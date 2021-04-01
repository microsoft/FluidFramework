/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    OdspDocumentServiceFactory,
    createOdspCreateContainerRequest,
    createOdspUrl,
    OdspDriverUrlResolver,
    HostStoragePolicy,
    ISnapshotOptions,
} from "@fluidframework/odsp-driver";
import {
    booleanCases,
    generatePairwiseOptions,
    OptionsMatrix,
    undefinedCases,
 } from "@fluid-internal/test-pairwise-generator";
import { Lazy } from "@fluidframework/common-utils";
import { pkgVersion } from "./packageVersion";

export const OdspDriverApi = {
    version: pkgVersion,
    OdspDocumentServiceFactory,
    OdspDriverUrlResolver,
    createOdspCreateContainerRequest,
    createOdspUrl,                          // REVIEW: does this need to be back compat?
};

export type OdspDriverApiType = typeof OdspDriverApi;

export const odspSnapshotOptions: OptionsMatrix<ISnapshotOptions> = {
    blobs: undefinedCases,
    channels: undefinedCases,
    deltas: undefinedCases,
    mds: undefinedCases,
    timeout: undefinedCases,
};

export const odspHostPolicyMatrix: OptionsMatrix<HostStoragePolicy> = {
    blobDeduping: booleanCases,
    concurrentSnapshotFetch: booleanCases,
    snapshotOptions:[undefined, odspSnapshotOptions],
};

export const pairwiseOdspHostStoragePolicy = new Lazy(()=>
    generatePairwiseOptions<HostStoragePolicy>(odspHostPolicyMatrix));
