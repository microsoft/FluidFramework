/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import {
	type AsyncGenerator,
	combineReducersAsync,
	createWeightedAsyncGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";

import {
	ddsModelMap,
	DDSModelOpGenerator,
	DDSModelOpReducer,
	validateConsistencyOfAllDDS,
	type DDSModelOp,
} from "../ddsModels.js";
import {
	createLocalServerStressSuite,
	LocalServerStressModel,
	type LocalServerStressState,
} from "../localServerStressHarness";
import type { StressDataObjectOperations } from "../stressDataObject.js";

import { _dirname } from "./dirname.cjs";

type StressOperations = StressDataObjectOperations | DDSModelOp;

const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
	createDataStore: async (state, op) => {
		state.datastore.createDataStore(op.tag, op.asChild);
	},
	createChannel: async (state, op) => {
		state.datastore.createChannel(op.tag, op.channelType);
	},
	uploadBlob: async (state, op) => {
		state.datastore.uploadBlob(op.tag, state.random.string(state.random.integer(1, 16)));
	},
	DDSModelOp: DDSModelOpReducer,
});

let tag = 0;
function makeGenerator(): AsyncGenerator<StressOperations, LocalServerStressState> {
	const asyncGenerator = createWeightedAsyncGenerator<
		StressOperations,
		LocalServerStressState
	>([
		[
			async (state) => ({
				type: "createDataStore",
				asChild: state.random.bool(),
				tag: `datastore-${++tag}`,
			}),
			1,
		],
		[
			async (state) => ({
				type: "uploadBlob",
				tag: `blob-${++tag}`,
			}),
			10,
		],
		[
			async (state) => ({
				type: "createChannel",
				channelType: state.random.pick([...ddsModelMap.keys()]),
				tag: `channel-${++tag}`,
			}),
			5,
		],
		[DDSModelOpGenerator, 100],
	]);

	return async (state) => asyncGenerator(state);
}
export const saveFailures = { directory: path.join(_dirname, "../../src/test/results") };
export const saveSuccesses = { directory: path.join(_dirname, "../../src/test/results") };

describe("Local Server Stress", () => {
	const model: LocalServerStressModel<StressOperations> = {
		workloadName: "default",
		generatorFactory: () => takeAsync(100, makeGenerator()),
		reducer,
		validateConsistency: validateConsistencyOfAllDDS,
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
		},
		reconnectProbability: 0.1,
		// skipMinimization: true,
		// Uncomment to replay a particular seed.
		// replay: 98,
		// only: [99],
		saveFailures,
		// saveSuccesses,
		skip: [],
	});
});
