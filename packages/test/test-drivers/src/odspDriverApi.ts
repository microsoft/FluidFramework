/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	booleanCases,
	generatePairwiseOptions,
	numberCases,
	OptionsMatrix,
} from "@fluid-private/test-pairwise-generator";
import {
	createOdspCreateContainerRequest,
	createOdspUrl,
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
} from "@fluidframework/odsp-driver/internal";
import {
	HostStoragePolicy,
	ICollabSessionOptions,
	IOpsCachingPolicy,
	ISnapshotOptions,
} from "@fluidframework/odsp-driver-definitions/internal";

import { pkgVersion } from "./packageVersion.js";

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
	displayName: [undefined],
};

/**
 * Generates pairwise combinations of ODSP host storage policy configurations for testing.
 *
 * @internal
 */
export const generateOdspHostStoragePolicy = (seed: number): HostStoragePolicy[] => {
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
	};
	return generatePairwiseOptions<HostStoragePolicy>(odspHostPolicyMatrix, seed);
};
