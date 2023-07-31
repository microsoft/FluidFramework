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
	rootFieldKey,
	UpPath,
	Anchor,
	JsonableTree,
} from "../../../core";
import { brand } from "../../../util";
import { SharedTreeTestFactory, toJsonableTree, validateTree } from "../../utils";
import { ISharedTree, SharedTreeView } from "../../../shared-tree";
import { makeOpGenerator, EditGeneratorOpWeights, FuzzTestState } from "./fuzzEditGenerators";
import {
	applyFieldEdit,
	applySynchronizationOp,
	applyTransactionEdit,
	applyUndoRedoEdit,
	fuzzReducer,
} from "./fuzzEditReducers";
import { onCreate, initialTreeState } from "./fuzzUtils";
import { Operation } from "./operationTypes";

interface AbortFuzzTestState extends FuzzTestState {
	firstAnchor?: Anchor;
}

/**
 * This interface is meant to be used for tests that require you to store a branch of a tree
 */
interface BranchedTreeFuzzTestState extends FuzzTestState {
	branch?: SharedTreeView;
}

/**
 * This interface is meant to be used for tests that require you to store a branch of a tree
 */
interface UndoRedoFuzzTestState extends FuzzTestState {
	initialTreeState?: JsonableTree[];
	firstAnchors?: Anchor[];
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
describe("Fuzz - Targeted", () => {
	const opsPerRun = 20;
	const runsPerBatch = 20;
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = { insert: 1 };
	describe("Anchors are unaffected by aborted transaction", () => {
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const generator = generatorFactory() as AsyncGenerator<Operation, AbortFuzzTestState>;
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
			const firstAnchor = getFirstAnchor(initialState.clients[0].channel);
			initialState.firstAnchor = firstAnchor;
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
					parentField: rootFieldKey,
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
		const generatorFactory = (): AsyncGenerator<Operation, BranchedTreeFuzzTestState> =>
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

	const undoRedoWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		delete: 1,
		start: 0,
		commit: 0,
	};

	describe.skip("Inorder undo/redo matches the initial/final state", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "SharedTree",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: UndoRedoFuzzTestState) => {
			initialState.initialTreeState = toJsonableTree(initialState.clients[0].channel);
			initialState.firstAnchors = [];
			// creates an initial anchor for each tree
			for (const client of initialState.clients) {
				initialState.firstAnchors.push(getFirstAnchor(client.channel));
			}
		});
		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			const clients = finalState.clients;

			const finalTreeStates = [];
			// undo all of the changes and validate against initialTreeState for each tree
			for (const [i, client] of clients.entries()) {
				const tree = client.channel;

				// save final tree states to validate redo later
				finalTreeStates.push(toJsonableTree(tree));

				/**
				 * TODO: Currently this for loop is used to call undo() "opsPerRun" number of times.
				 * Once the undo stack exposed, remove this array and use the stack to keep track instead.
				 */
				for (let j = 0; j < opsPerRun; j++) {
					tree.undo();
				}
			}

			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();

			// validate the current state of the clients with the initial state, and check anchor stability
			for (const [i, client] of clients.entries()) {
				assert(finalState.initialTreeState !== undefined);
				validateTree(client.channel, finalState.initialTreeState);
				// check anchor stability
				const expectedPath: UpPath = {
					parent: {
						parent: undefined,
						parentIndex: 0,
						parentField: rootFieldKey,
					},
					parentField: brand("foo"),
					parentIndex: 1,
				};
				assert(finalState.firstAnchors !== undefined);
				assert(finalState.firstAnchors[i] !== undefined);
				const anchorPath = client.channel.locate(finalState.firstAnchors[i]);
				assert(compareUpPaths(expectedPath, anchorPath));
			}

			// redo all of the undone changes and validate against the finalTreeState for each tree
			for (const [i, client] of clients.entries()) {
				for (let j = 0; j < opsPerRun; j++) {
					client.channel.redo();
				}
				validateTree(client.channel, finalTreeStates[i]);
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			emitter,
		});
	});

	describe("out of order undo matches the initial state", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "SharedTree",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: UndoRedoFuzzTestState) => {
			initialState.initialTreeState = toJsonableTree(initialState.clients[0].channel);
			initialState.firstAnchors = [];
			// creates an initial anchor for each tree
			for (const client of initialState.clients) {
				initialState.firstAnchors.push(getFirstAnchor(client.channel));
			}
		});
		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			const clients = finalState.clients;

			/**
			 * TODO: Currently this array is used to track that undo() is called "opsPerRun" number of times.
			 * Once the undo stack exposed, remove this array and use the stack to keep track instead.
			 */
			const undoOrderByClientIndex = Array.from(
				{ length: opsPerRun * clients.length },
				(_, index) => Math.floor(index / opsPerRun),
			);
			finalState.random.shuffle(undoOrderByClientIndex);
			// call undo() until trees contain no more edits to undo
			for (const clientIndex of undoOrderByClientIndex) {
				clients[clientIndex].channel.undo();
			}
			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();

			// validate the current state of the clients with the initial state, and check anchor stability
			for (const [i, client] of clients.entries()) {
				assert(finalState.initialTreeState !== undefined);
				validateTree(client.channel, finalState.initialTreeState);
				// check anchor stability
				const expectedPath: UpPath = {
					parent: {
						parent: undefined,
						parentIndex: 0,
						parentField: rootFieldKey,
					},
					parentField: brand("foo"),
					parentIndex: 1,
				};
				assert(finalState.firstAnchors !== undefined);
				assert(finalState.firstAnchors[i] !== undefined);
				const anchorPath = client.channel.locate(finalState.firstAnchors[i]);
				assert(compareUpPaths(expectedPath, anchorPath));
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			emitter,
			skip: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 19],
		});
	});
});

function getFirstAnchor(tree: ISharedTree): Anchor {
	// building the anchor for anchor stability test
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	cursor.enterNode(0);
	cursor.getPath();
	cursor.firstField();
	cursor.getFieldKey();
	cursor.enterNode(1);
	const anchor = cursor.buildAnchor();
	cursor.free();
	return anchor;
}
