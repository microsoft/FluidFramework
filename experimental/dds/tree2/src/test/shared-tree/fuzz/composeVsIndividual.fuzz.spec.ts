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
	createDDSFuzzSuite,
	DDSFuzzHarnessEvents,
} from "@fluid-internal/test-dds-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { SharedTreeTestFactory, toJsonableTree, validateTree } from "../../utils";
import { ISharedTreeBranchView2, ISharedTreeView2 } from "../../../shared-tree";
import {
	makeOpGenerator,
	EditGeneratorOpWeights,
	FuzzTestState,
	viewFromState,
} from "./fuzzEditGenerators";
import {
	applyFieldEdit,
	applySynchronizationOp,
	applyTransactionEdit,
	applyUndoRedoEdit,
} from "./fuzzEditReducers";
import { fuzzSchema, isRevertibleSharedTreeView } from "./fuzzUtils";
import { Operation } from "./operationTypes";

/**
 * This interface is meant to be used for tests that require you to store a branch of a tree
 */
interface BranchedTreeFuzzTestState extends FuzzTestState {
	main?: ISharedTreeView2<typeof fuzzSchema.rootFieldSchema>;
	branch?: ISharedTreeBranchView2<typeof fuzzSchema.rootFieldSchema>;
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
		const { contents } = operation;
		const tree = state.main ?? assert.fail();
		applyTransactionEdit(tree.branch, contents);
		return state;
	},
	undoRedo: async (state, operation) => {
		const { contents } = operation;
		const tree = state.main ?? assert.fail();
		assert(isRevertibleSharedTreeView(tree.branch));
		applyUndoRedoEdit(tree.branch.undoStack, tree.branch.redoStack, contents);
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
	const runsPerBatch = 20;

	// "start" and "commit" opWeights set to 0 in case there are changes to the default weights.
	const composeVsIndividualWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		delete: 1,
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
			initialState.branch = initialState.main.fork();
			initialState.branch.branch.transaction.start();
		});
		emitter.on("testEnd", (finalState: BranchedTreeFuzzTestState) => {
			assert(finalState.branch !== undefined);
			const childTreeView = toJsonableTree(finalState.branch.branch);
			finalState.branch.branch.transaction.commit();
			const tree = finalState.main ?? assert.fail();
			tree.branch.merge(finalState.branch.branch);
			validateTree(tree.branch, childTreeView);
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 1,
			emitter,
		});
	});
});
