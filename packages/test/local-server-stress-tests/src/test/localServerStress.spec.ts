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

import { _dirname } from "./dirname.cjs";

interface UploadBlob {
	type: "uploadBlob";
	id: `blob-${number}`;
}
interface CreateDataStore {
	type: "createDataStore";
	asChild: boolean;
	id: `datastore-${number}`;
}

interface CreateChannel {
	type: "createChannel";
	channelType: string;
	id: `channel-${number}`;
}

type StressOperations = UploadBlob | CreateDataStore | CreateChannel | DDSModelOp;

const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
	createDataStore: async (state, op) => {
		state.datastore.createDataStore(op.id, op.asChild);
	},
	createChannel: async (state, op) => {
		state.datastore.createChannel(op.id, op.channelType);
	},
	uploadBlob: async (state, op) => {
		state.datastore.uploadBlob(op.id, state.random.string(state.random.integer(1, 16)));
	},
	DDSModelOp: DDSModelOpReducer,
});

let id = 0;
function makeGenerator(): AsyncGenerator<StressOperations, LocalServerStressState> {
	const asyncGenerator = createWeightedAsyncGenerator<
		StressOperations,
		LocalServerStressState
	>([
		[
			async (state) => ({
				type: "createDataStore",
				asChild: state.random.bool(),
				id: `datastore-${++id}`,
			}),
			1,
		],
		[
			async (state) => ({
				type: "uploadBlob",
				id: `blob-${++id}`,
			}),
			10,
		],
		[
			async (state) => ({
				type: "createChannel",
				channelType: state.random.pick([...ddsModelMap.keys()]),
				id: `channel-${++id}`,
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
		skipMinimization: true,
		// Uncomment to replay a particular seed.
		// replay: 98,
		// only: [98],
		saveFailures,
		saveSuccesses,
	});
});
