/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AsyncGenerator,
	combineReducersAsync,
	takeAsync,
} from "@fluid-internal/stochastic-test-utils";
import {
	DDSFuzzModel,
	DDSFuzzTestState,
	DDSFuzzHarnessEvents,
	Client,
	getFullModel,
} from "@fluid-internal/test-dds-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	defaultDDSFuzzSuiteOptions,
	runTestForSeed,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluid-internal/test-dds-utils/dist/ddsFuzzHarness";
import { SharedTreeTestFactory, toJsonableTree } from "../../utils";
import { makeOpGenerator, EditGeneratorOpWeights, FuzzTestState } from "./fuzzEditGenerators";
import {
	applyFieldEdit,
	applySynchronizationOp,
	applyTransactionEdit,
	applyUndoRedoEdit,
} from "./fuzzEditReducers";
import { onCreate } from "./fuzzUtils";
import { Operation } from "./operationTypes";

interface FuzzTestStateWithHistory extends FuzzTestState {
	history?: Map<Client<SharedTreeTestFactory>, string[]>;
}

const fuzzReducerWithHistory = combineReducersAsync<Operation, FuzzTestStateWithHistory>({
	edit: async (state, operation) => {
		const { contents } = operation;
		updateEmptyClientHistory(state);
		switch (contents.type) {
			case "fieldEdit": {
				const tree = state.channel.view;
				assert(tree !== undefined);
				applyFieldEdit(tree, contents);
				break;
			}
			default:
				break;
		}
		updateStateHistory(state);
		return state;
	},
	transaction: async (state, operation) => {
		updateEmptyClientHistory(state);
		const { contents } = operation;
		const tree = state.channel;
		applyTransactionEdit(tree.view, contents);
		updateStateHistory(state);
		return state;
	},
	undoRedo: async (state, operation) => {
		updateEmptyClientHistory(state);
		const { contents } = operation;
		const tree = state.channel;
		applyUndoRedoEdit(tree.view, contents);
		updateStateHistory(state);
		return state;
	},
	synchronizeTrees: async (state) => {
		updateEmptyClientHistory(state);
		applySynchronizationOp(state);
		updateStateHistory(state);
		return state;
	},
});

function updateEmptyClientHistory(state: FuzzTestStateWithHistory) {
	if (state.history?.get(state.client) === undefined) {
		state.history?.set(state.client, [JSON.stringify(toJsonableTree(state.channel.view))]);
	}
}

function updateStateHistory(state: FuzzTestStateWithHistory) {
	for (const client of state.clients) {
		state.history?.get(client)?.push(JSON.stringify(toJsonableTree(client.channel.view)));
	}
}

export async function getFuzzTestTreeStates(seed: number, numberOfClients: number) {
	const composeVsIndividualWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		delete: 1,
		start: 0,
		commit: 0,
	};
	const opsPerRun = 20;
	const runsPerBatch = 1;

	const generatorFactory = (): AsyncGenerator<Operation, FuzzTestStateWithHistory> =>
		takeAsync(opsPerRun, makeOpGenerator(composeVsIndividualWeights));
	const ddsModel: DDSFuzzModel<
		SharedTreeTestFactory,
		Operation,
		DDSFuzzTestState<SharedTreeTestFactory>
	> = {
		workloadName: "SharedTree",
		factory: new SharedTreeTestFactory(onCreate),
		generatorFactory,
		reducer: fuzzReducerWithHistory,
		validateConsistency: () => {},
	};
	const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
	const treeStates: string[][] = [];
	emitter.on("testStart", (initialState: FuzzTestStateWithHistory) => {
		initialState.history = new Map<Client<SharedTreeTestFactory>, string[]>();
		for (const client of initialState.clients) {
			initialState.history?.set(client, [
				JSON.stringify(toJsonableTree(client.channel.view)),
			]);
		}
	});
	emitter.on("testEnd", (finalState: FuzzTestStateWithHistory) => {
		for (const client of finalState.clients) {
			const clientHistory = finalState.history?.get(client);
			assert(clientHistory !== undefined);
			treeStates.push(clientHistory);
		}
	});
	const providedOptions = {
		defaultTestCount: runsPerBatch,
		numberOfClients,
		emitter,
	};
	const options = {
		...defaultDDSFuzzSuiteOptions,
		...providedOptions,
	};
	const model = getFullModel(ddsModel, options);
	await runTestForSeed(model, options, seed);
	return treeStates;
}

describe.only("Fuzz - save tree states history", () => {
	it.only("with provided seed and number of clients", async () => {
		await getFuzzTestTreeStates(0, 2);
	});
});
