/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	booleanCases,
	generatePairwiseOptions,
	OptionsMatrix,
	numberCases,
} from "@fluid-private/test-pairwise-generator";
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
	ICollabSessionOptions,
} from "@fluidframework/odsp-driver-definitions";
import { pkgVersion } from "./packageVersion";

/**
 * @internal
 */
export const OdspDriverApi = {
	version: pkgVersion,
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	createOdspCreateContainerRequest,
	createOdspUrl, // REVIEW: does this need to be back compat?
};

/**
 * @internal
 */
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

const odspSessionOptions: OptionsMatrix<ICollabSessionOptions> = {
	unauthenticatedUserDisplayName: [undefined],
	forceAccessTokenViaAuthorizationHeader: [undefined],
};

/**
 * @internal
 */
export const generateOdspHostStoragePolicy = (seed: number) => {
	const odspHostPolicyMatrix: OptionsMatrix<HostStoragePolicy> = {
		concurrentSnapshotFetch: booleanCases,
		opsBatchSize: numberCases,
		concurrentOpsBatches: numberCases,
		snapshotOptions: [undefined, ...generatePairwiseOptions(odspSnapshotOptions, seed)],
		opsCaching: [undefined, ...generatePairwiseOptions(odspOpsCaching, seed)],
		sessionOptions: [undefined, ...generatePairwiseOptions(odspSessionOptions, seed)],
		enableRedeemFallback: booleanCases,
		cacheCreateNewSummary: booleanCases,
		fetchBinarySnapshotFormat: [undefined],
		isolateSocketCache: [true],
		enableShareLinkWithCreate: [false],
		enableSingleRequestForShareLinkWithCreate: [false],
		avoidPrefetchSnapshotCache: booleanCases,
		disableRetriesOnStorageThrottlingError: [false],
	};
	return generatePairwiseOptions<HostStoragePolicy>(odspHostPolicyMatrix, seed);
};
