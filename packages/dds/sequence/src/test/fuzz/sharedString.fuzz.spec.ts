/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { baseSharedStringModel, defaultFuzzOptions } from "./fuzzUtils.js";

describe("SharedString fuzz testing", () => {
	createDDSFuzzSuite(
		{ ...baseSharedStringModel, workloadName: "SharedString default" },
		{
			...defaultFuzzOptions,
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
		},
	);
});

describe("SharedString fuzz with stashing", () => {
	createDDSFuzzSuite(
		{ ...baseSharedStringModel, workloadName: "SharedString with stashing" },
		{
			...defaultFuzzOptions,
			clientJoinOptions: {
				clientAddProbability: 0.1,
				maxNumberOfClients: Number.MAX_SAFE_INTEGER,
				stashableClientProbability: 0.2,
			},
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
		},
	);
});

describe("SharedString fuzz testing with rebased batches", () => {
	createDDSFuzzSuite(
		{ ...baseSharedStringModel, workloadName: "SharedString with rebasing" },
		{
			...defaultFuzzOptions,
			reconnectProbability: 0.0,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 3,
				clientAddProbability: 0.0,
			},
			rebaseProbability: 0.2,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
		},
	);
});

// todo: potentially related to AB#7050
//
// `intervalRebasing.spec.ts` contains some reduced tests exhibiting the crashes
// linked to AB#7050
describe.skip("SharedString fuzz testing with rebased batches and reconnect", () => {
	createDDSFuzzSuite(
		{
			...baseSharedStringModel,
			workloadName: "SharedString with rebasing and reconnect",
		},
		{
			...defaultFuzzOptions,
			reconnectProbability: 0.3,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 3,
				clientAddProbability: 0.0,
			},
			rebaseProbability: 0.2,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
		},
	);
});
