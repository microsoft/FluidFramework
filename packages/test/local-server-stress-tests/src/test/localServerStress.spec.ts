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
import { assert } from "@fluidframework/core-utils/internal";

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
import type { ContainerObjects } from "../stressDataObject.js";

import { _dirname } from "./dirname.cjs";

interface UploadBlob {
	type: "uploadBlob";
	id: `blob-${number}`;
}
interface AliasDataStore {
	type: "aliasDataStore";
	datastoreId: `datastore-${number}`;
	alias: string;
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

type StressOperations =
	| UploadBlob
	| AliasDataStore
	| CreateDataStore
	| CreateChannel
	| DDSModelOp;

const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
	aliasDataStore: async (state, op) => {
		const entry = state.client.entryPoint.globalObjects[op.datastoreId];
		assert(
			entry.type === "stressDataObject" && entry.dataStore !== undefined,
			"must be a new datastore",
		);

		void entry.dataStore.trySetAlias(op.alias);
	},
	createDataStore: async (state, op) => {
		state.client.entryPoint.createDataStore(op.id, op.asChild);
	},
	createChannel: async (state, op) => {
		state.client.entryPoint.createChannel(op.id, op.channelType);
	},
	uploadBlob: async (state, op) => {
		state.client.entryPoint.uploadBlob(
			op.id,
			state.random.string(state.random.integer(1, 16)),
		);
	},
	DDSModelOp: DDSModelOpReducer,
});

let id = 0;
function makeGenerator(): AsyncGenerator<StressOperations, LocalServerStressState> {
	const aliasDataStore: AsyncGenerator<AliasDataStore, LocalServerStressState> = async (
		state,
	) => {
		const newDataStores = Object.entries(state.client.entryPoint.globalObjects).filter(
			(e): e is [string, Extract<ContainerObjects, { type: "stressDataObject" }>] =>
				e[1].type === "stressDataObject" && e[1].dataStore !== undefined,
		);
		return {
			type: "aliasDataStore",
			datastoreId: state.random.pick(newDataStores)[1].id,
			alias: `alias-${state.random.integer(0, 10)}`,
		} satisfies AliasDataStore;
	};

	const asyncGenerator = createWeightedAsyncGenerator<
		StressOperations,
		LocalServerStressState
	>([
		[
			aliasDataStore,
			1,
			(state) =>
				Object.values(state.client.entryPoint.globalObjects).some(
					(v) => v.type === "stressDataObject" && v.dataStore !== undefined,
				),
		],
		[
			async (state) => ({
				type: "createDataStore",
				asChild: state.random.bool(),
				id: `datastore-${++id}`,
			}),
			2,
		],
		[
			async (state) => ({
				type: "uploadBlob",
				id: `blob-${++id}`,
			}),
			2,
		],
		[
			async (state) => ({
				type: "createChannel",
				channelType: state.random.pick([...ddsModelMap.keys()]),
				id: `channel-${++id}`,
			}),
			3,
		],
		[DDSModelOpGenerator, 4],
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
		// replay: 5,
		saveFailures,
		saveSuccesses,
	});
});
