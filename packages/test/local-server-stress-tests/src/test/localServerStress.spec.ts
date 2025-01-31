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
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IDataStore } from "@fluidframework/runtime-definitions/internal";

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
}
interface AliasDataStore {
	type: "aliasDataStore";
	id: string;
}
interface CreateDataStore {
	type: "createDataStore";
	asChild: boolean;
}

interface CreateChannel {
	type: "createChannel";
	channelType: string;
}

type StressOperations =
	| UploadBlob
	| AliasDataStore
	| CreateDataStore
	| CreateChannel
	| DDSModelOp;

const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
	aliasDataStore: async (state, op) => {
		const entry = state.client.entryPoint.globalObjects[op.id];
		assert(entry.type === "newDatastore", "must be a new datastore");

		void entry.dataStore.trySetAlias(String.fromCodePoint(state.random.integer(0, 26) + 65));
	},
	createDataStore: async (state, op) => {
		state.client.entryPoint.createDataStore(op.asChild);
	},
	createChannel: async (state, op) => {
		state.client.entryPoint.createChannel(op.channelType);
	},
	uploadBlob: async (state) => {
		state.client.entryPoint.uploadBlob(state.random.string(state.random.integer(1, 16)));
	},
	DDSModelOp: DDSModelOpReducer,
});

function makeGenerator(): AsyncGenerator<StressOperations, LocalServerStressState> {
	const aliasDataStore: AsyncGenerator<AliasDataStore, LocalServerStressState> = async (
		state,
	) => {
		const newDataStores = Object.entries(state.client.entryPoint.globalObjects).filter(
			(
				e,
			): e is [
				string,
				{ type: "newDatastore"; dataStore: IDataStore; handle: IFluidHandle },
			] => e[1].type === "newDatastore",
		);
		const [id] = state.random.pick(newDataStores);
		return {
			type: "aliasDataStore",
			id,
		} satisfies AliasDataStore;
	};

	const syncGenerator = createWeightedAsyncGenerator<StressOperations, LocalServerStressState>(
		[
			[
				aliasDataStore,
				1,
				(state) =>
					Object.values(state.client.entryPoint.globalObjects).some(
						(v) => v.type === "newDatastore",
					),
			],
			[async (state) => ({ type: "createDataStore", asChild: state.random.bool() }), 2],
			[{ type: "uploadBlob" }, 2],
			[
				async (state) => ({
					type: "createChannel",
					channelType: state.random.pick([...ddsModelMap.keys()]),
				}),
				3,
			],
			[DDSModelOpGenerator, 4],
		],
	);

	return async (state) => syncGenerator(state);
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
		// replay: 24,
		saveFailures,
		saveSuccesses,
	});
});
