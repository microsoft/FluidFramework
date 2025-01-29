/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import {
	type AsyncGenerator,
	Generator,
	combineReducersAsync,
	createWeightedGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import type { IDataStore } from "@fluidframework/runtime-definitions/internal";

import {
	createLocalServerStressSuite,
	LocalServerStressModel,
	type LocalServerStressState,
} from "../localServerStressHarness";

import { _dirname } from "./dirname.cjs";
import { assert } from "@fluidframework/core-utils/internal";

interface UploadBlob {
	type: "uploadBlob";
}
interface AliasDataStore {
	type: "aliasDataStore";
	id: string;
}
interface CreateDataStore {
	type: "createDataStore";
}

type StressOperations = UploadBlob | AliasDataStore | CreateDataStore;

const reducer = combineReducersAsync<StressOperations, LocalServerStressState>({
	aliasDataStore: async (state, op) => {
		const entry = state.client.entryPoint.globalObjects[op.id];
		assert(entry.type === "newDatastore", "must be a new datastore");

		await entry.dataStore.trySetAlias(String.fromCodePoint(state.random.integer(0, 26) + 65));
	},
	createDataStore: async (state) => {
		state.client.entryPoint.createDataStore(state.random.uuid4());
	},
	uploadBlob: async (state) => {
		state.client.entryPoint.uploadBlob(
			state.random.uuid4(),
			state.random.string(state.random.integer(1, 246)),
		);
	},
});

function makeGenerator(): AsyncGenerator<StressOperations, LocalServerStressState> {
	const aliasDataStore: Generator<AliasDataStore, LocalServerStressState> = (state) => {
		const newDataStores = Object.entries(state.client.entryPoint.globalObjects).filter(
			(e): e is [string, { type: "newDatastore"; dataStore: IDataStore }] =>
				e[1].type === "newDatastore",
		);
		const [id] = state.random.pick(newDataStores);
		return {
			type: "aliasDataStore",
			id,
		} satisfies AliasDataStore;
	};

	const syncGenerator = createWeightedGenerator<StressOperations, LocalServerStressState>([
		[
			aliasDataStore,
			1,
			(state) =>
				Object.values(state.client.entryPoint.globalObjects).some(
					(v) => v.type === "newDatastore",
				),
		],
		[{ type: "createDataStore" }, 1],
		[{ type: "uploadBlob" }, 1],
	]);

	return async (state) => syncGenerator(state);
}

describe("Local Server Stress", () => {
	const model: LocalServerStressModel<StressOperations> = {
		workloadName: "default",
		generatorFactory: () => takeAsync(100, makeGenerator()),
		reducer: async (state, operation) => reducer(state, operation),
		validateConsistency: () => {},
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
		},
		reconnectProbability: 0,
		// Uncomment to replay a particular seed.
		// replay: 0,
		saveFailures: { directory: path.join(_dirname, "../../results") },
		saveSuccesses: { directory: path.join(_dirname, "../../results") },
	});
});
