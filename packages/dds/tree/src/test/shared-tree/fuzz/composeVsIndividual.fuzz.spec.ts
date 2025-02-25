/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type AsyncGenerator,
	combineReducersAsync,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzHarnessEvents,
	type DDSFuzzModel,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import { SharedTreeTestFactory, toJsonableTree, validateTree } from "../../utils.js";

import {
	type EditGeneratorOpWeights,
	type FuzzTestState,
	type FuzzTransactionView,
	type FuzzView,
	makeOpGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import {
	applyForkMergeOperation,
	applyConstraint,
	applyFieldEdit,
	applySynchronizationOp,
	applyUndoRedoEdit,
} from "./fuzzEditReducers.js";
import {
	createOnCreate,
	deterministicIdCompressorFactory,
	isRevertibleSharedTreeView,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";

/**
 * This interface is meant to be used for tests that require you to store a branch of a tree
 */
interface BranchedTreeFuzzTestState extends FuzzTestState {
	main?: FuzzView;
	branch?: FuzzTransactionView;
}

const fuzzComposedVsIndividualReducer = combineReducersAsync<
	Operation,
	BranchedTreeFuzzTestState
>({
	treeEdit: async (state, { edit }) => {
		switch (edit.type) {
			case "fieldEdit": {
				const tree = state.branch;
				assert(tree !== undefined);
				applyFieldEdit(tree, edit);
				break;
			}
			default:
				fail("Unknown tree edit type");
		}
		return state;
	},
	transactionBoundary: async (state, operation) => {
		assert.fail(
			"Transactions are simulated manually in these tests and should not be generated.",
		);
	},
	undoRedo: async (state, { operation }) => {
		const tree = state.main ?? assert.fail();
		assert(isRevertibleSharedTreeView(tree.checkout));
		applyUndoRedoEdit(tree.checkout.undoStack, tree.checkout.redoStack, operation);
		return state;
	},
	synchronizeTrees: async (state) => {
		applySynchronizationOp(state);
		return state;
	},
	schemaChange: async (state, operation) => {
		return state;
	},
	constraint: async (state, operation) => {
		applyConstraint(state, operation);
	},
	forkMergeOperation: async (state, operation) => {
		return applyForkMergeOperation(state, operation);
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
	// schema ops are set to 0, as creating a new fork/view during schemaOps would not allow us to continue with the transaction.
	const composeVsIndividualWeights: Partial<EditGeneratorOpWeights> = {
		set: 2,
		clear: 1,
		insert: 1,
		remove: 2,
		intraFieldMove: 2,
		crossFieldMove: 2,
		fieldSelection: {
			optional: 1,
			required: 1,
			sequence: 2,
			recurse: 1,
		},
		start: 0,
		commit: 0,
		schema: 0,
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
			factory: new SharedTreeTestFactory(createOnCreate(undefined)),
			generatorFactory,
			reducer: fuzzComposedVsIndividualReducer,
			validateConsistency: () => {},
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: BranchedTreeFuzzTestState) => {
			initialState.main = viewFromState(initialState, initialState.clients[0]);

			const forkedView = initialState.main.fork() as unknown as FuzzTransactionView;
			const treeSchema = initialState.main.currentSchema;

			forkedView.currentSchema =
				treeSchema ?? assert.fail("nodeSchema should not be undefined");
			initialState.branch = forkedView;
			initialState.branch.checkout.transaction.start();
			initialState.transactionViews?.delete(initialState.clients[0].channel);
			const transactionViews = new Map();

			transactionViews.set(initialState.clients[0].channel, initialState.branch);
			initialState.transactionViews = transactionViews;
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
