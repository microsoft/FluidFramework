/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	AsyncGenerator,
	combineReducersAsync,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import {
	DDSFuzzHarnessEvents,
	DDSFuzzModel,
	DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { SharedTreeTestFactory, toJsonableTree, validateTree } from "../../utils.js";
import {
	EditGeneratorOpWeights,
	FuzzTestState,
	FuzzTransactionView,
	FuzzView,
	makeOpGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { applyFieldEdit, applySynchronizationOp, applyUndoRedoEdit } from "./fuzzEditReducers.js";
import { deterministicIdCompressorFactory, isRevertibleSharedTreeView } from "./fuzzUtils.js";
import { Operation } from "./operationTypes.js";

/**
 * This interface is meant to be used for tests that require you to store a branch of a tree
 */
interface BranchedTreeFuzzTestState extends FuzzTestState {
	main?: FuzzView;
	branch?: FuzzTransactionView;
}

const fuzzComposedVsIndividualReducer = combineReducersAsync<Operation, BranchedTreeFuzzTestState>({
	edit: async (state, operation) => {
		const { contents } = operation;
		switch (contents.type) {
			case "fieldEdit": {
				const tree = state.branch;
				assert(tree !== undefined);
				applyFieldEdit(tree, contents);
				break;
			}
			default:
				break;
		}
		return state;
	},
	transaction: async (state, operation) => {
		assert.fail(
			"Transactions are simulated manually in these tests and should not be generated.",
		);
	},
	undoRedo: async (state, operation) => {
		const { contents } = operation;
		const tree = state.main ?? assert.fail();
		assert(isRevertibleSharedTreeView(tree.checkout));
		applyUndoRedoEdit(tree.checkout.undoStack, tree.checkout.redoStack, contents);
		return state;
	},
	synchronizeTrees: async (state) => {
		applySynchronizationOp(state);
		return state;
	},
});

/**
 * Fuzz tests in this suite are meant to exercise specific code paths or invariants.
 * They should typically use SharedTree's branching APIs to emulate multiple clients concurrently editing the document
 * as that is less computationally expensive and offers greater control over the order of concurrent operations.
 *
 * See the "Fuzz - Top-Level" test suite for tests are more general in scope.
 */
describe("Fuzz - composed vs individual changes", () => {
	const opsPerRun = 20;
	const runsPerBatch = 50;

	// "start" and "commit" opWeights set to 0 in case there are changes to the default weights.
	const composeVsIndividualWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		remove: 2,
		move: 2,
		fieldSelection: {
			optional: 1,
			required: 1,
			sequence: 2,
			recurse: 1,
		},
		start: 0,
		commit: 0,
	};

	describe("converges to the same tree", () => {
		const generatorFactory = (): AsyncGenerator<Operation, BranchedTreeFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(composeVsIndividualWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "SharedTree",
			factory: new SharedTreeTestFactory(() => {}),
			generatorFactory,
			reducer: fuzzComposedVsIndividualReducer,
			validateConsistency: () => {},
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: BranchedTreeFuzzTestState) => {
			initialState.main = viewFromState(initialState, initialState.clients[0]);
			initialState.branch = initialState.main.fork() as FuzzTransactionView;
			initialState.branch.currentSchema = initialState.main.currentSchema;
			initialState.branch.checkout.transaction.start();
		});
		emitter.on("testEnd", (finalState: BranchedTreeFuzzTestState) => {
			assert(finalState.branch !== undefined);
			const childTreeView = toJsonableTree(finalState.branch.checkout);
			finalState.branch.checkout.transaction.commit();
			const tree = finalState.main ?? assert.fail();
			tree.checkout.merge(finalState.branch.checkout);
			validateTree(tree.checkout, childTreeView);
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 1,
			emitter,
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
			detachedStartOptions: {
				numOpsBeforeAttach: 5,
				// This test can't use rehydrate as it holds on to the original client instance.
				// to hook into.
				rehydrateDisabled: true,
			},
		});
	});
});
