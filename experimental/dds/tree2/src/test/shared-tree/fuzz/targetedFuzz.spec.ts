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
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	moveToDetachedField,
	compareUpPaths,
	rootFieldKeySymbol,
	UpPath,
	Anchor,
} from "../../../core";
import { brand } from "../../../util";
import { SharedTreeTestFactory, toJsonableTree, validateTree } from "../../utils";
import { SharedTreeView } from "../../../shared-tree";
import { makeOpGenerator, EditGeneratorOpWeights, FuzzTestState } from "./fuzzEditGenerators";
import {
	applyFieldEdit,
	applyTransactionEdit,
	applyUndoRedoEdit,
	fuzzReducer,
} from "./fuzzEditReducers";
import { onCreate, initialTreeState } from "./fuzzUtils";
import { Operation, TreeOperation } from "./operationTypes";

interface AbortFuzzTestState extends FuzzTestState {
	firstAnchor?: Anchor;
}

/**
 * This interface is meant to be used for tests that require you to store a branch of a tree
 */
interface BranchedTreeFuzzTestState extends FuzzTestState {
	branch?: SharedTreeView;
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
		const tree = state.channel;
		applyTransactionEdit(tree, contents);
		return state;
	},
	undoRedo: async (state, operation) => {
		const { contents } = operation;
		const tree = state.channel;
		applyUndoRedoEdit(tree, contents);
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
describe("Fuzz - Targeted", () => {
	const opsPerRun = 20;
	const runsPerBatch = 20;
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = { insert: 1 };
	describe("Anchors are unaffected by aborted transaction", () => {
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const generator = generatorFactory() as AsyncGenerator<TreeOperation, AbortFuzzTestState>;
		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "SharedTree",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory: () => generator,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};

		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AbortFuzzTestState) => {
			// building the anchor for anchor stability test
			const cursor = initialState.clients[0].channel.forest.allocateCursor();
			moveToDetachedField(initialState.clients[0].channel.forest, cursor);
			cursor.enterNode(0);
			cursor.getPath();
			cursor.firstField();
			cursor.getFieldKey();
			cursor.enterNode(1);
			initialState.firstAnchor = cursor.buildAnchor();
			cursor.free();
			initialState.clients[0].channel.transaction.start();
		});

		emitter.on("testEnd", (finalState: AbortFuzzTestState) => {
			// aborts any transactions that may still be in progress
			finalState.clients[0].channel.transaction.abort();
			validateTree(finalState.clients[0].channel, [initialTreeState]);
			// validate anchor
			const expectedPath: UpPath = {
				parent: {
					parent: undefined,
					parentIndex: 0,
					parentField: rootFieldKeySymbol,
				},
				parentField: brand("foo"),
				parentIndex: 1,
			};
			assert(finalState.firstAnchor !== undefined);
			const anchorPath = finalState.clients[0].channel.locate(finalState.firstAnchor);
			assert(compareUpPaths(expectedPath, anchorPath));
		});

		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 1,
			emitter,
		});
	});
	// "start" and "commit" opWeights set to 0 in case there are changes to the default weights.
	const composeVsIndividualWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		delete: 1,
		start: 0,
		commit: 0,
	};

	describe("Composed vs individual changes converge to the same tree", () => {
		const generatorFactory = (): AsyncGenerator<TreeOperation, BranchedTreeFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(composeVsIndividualWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "SharedTree",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzComposedVsIndividualReducer,
			validateConsistency: () => {},
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: BranchedTreeFuzzTestState) => {
			initialState.branch = initialState.clients[0].channel.fork();
			initialState.branch.transaction.start();
		});
		emitter.on("testEnd", (finalState: BranchedTreeFuzzTestState) => {
			assert(finalState.branch !== undefined);
			const childTreeView = toJsonableTree(finalState.branch);
			finalState.branch.transaction.commit();
			finalState.clients[0].channel.merge(finalState.branch);
			validateTree(finalState.clients[0].channel, childTreeView);
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 1,
			emitter,
		});
	});
});
