/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AsyncGenerator, takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	DDSFuzzModel,
	DDSFuzzTestState,
	createDDSFuzzSuite,
	DDSFuzzHarnessEvents,
} from "@fluid-private/test-dds-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { UpPath, Anchor, JsonableTree, Value } from "../../../core/index.js";
import {
	SharedTreeTestFactory,
	createTestUndoRedoStacks,
	toJsonableTree,
	validateTree,
	validateTreeConsistency,
} from "../../utils.js";
import {
	makeOpGenerator,
	EditGeneratorOpWeights,
	FuzzTestState,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	RevertibleSharedTreeView,
	createAnchors,
	failureDirectory,
	isRevertibleSharedTreeView,
	onCreate,
	validateAnchors,
} from "./fuzzUtils.js";
import { Operation } from "./operationTypes.js";

/**
 * This interface is meant to be used for tests that require you to store a branch of a tree
 */
interface UndoRedoFuzzTestState extends FuzzTestState {
	initialTreeState?: JsonableTree[];
	// Parallel array to `clients`: set in testStart
	anchors?: Map<Anchor, [UpPath, Value]>[];
}

describe("Fuzz - undo/redo", () => {
	const opsPerRun = 20;
	const runsPerBatch = 20;

	const undoRedoWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		remove: 1,
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
			const tree = viewFromState(initialState).checkout;
			initialState.initialTreeState = toJsonableTree(tree);
			initialState.anchors = [];
			for (const client of initialState.clients) {
				const view = viewFromState(initialState, client)
					.checkout as RevertibleSharedTreeView;
				const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
				view.undoStack = undoStack;
				view.redoStack = redoStack;
				view.unsubscribe = unsubscribe;
				initialState.anchors.push(createAnchors(view));
			}
		});
		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			const anchors = finalState.anchors ?? assert.fail("Anchors should be defined");

			const finalTreeStates = [];
			// undo all of the changes and validate against initialTreeState for each tree
			for (const [i, client] of finalState.clients.entries()) {
				const tree = viewFromState(finalState, client).checkout;
				assert(isRevertibleSharedTreeView(tree));

				// save final tree states to validate redo later
				finalTreeStates.push(toJsonableTree(tree));

				/**
				 * TODO: Currently this for loop is used to call undo() "opsPerRun" number of times.
				 * Once the undo stack exposed, remove this array and use the stack to keep track instead.
				 */
				for (let j = 0; j < opsPerRun; j++) {
					tree.undoStack.pop()?.revert();
				}
			}

			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();

			// validate the current state of the clients with the initial state, and check anchor stability
			for (const [i, client] of finalState.clients.entries()) {
				assert(finalState.initialTreeState !== undefined);
				const tree = viewFromState(finalState, client).checkout;
				validateTree(tree, finalState.initialTreeState);
				validateAnchors(tree, anchors[i], true);
			}

			// redo all of the undone changes and validate against the finalTreeState for each tree
			for (const [i, client] of finalState.clients.entries()) {
				const view = viewFromState(finalState, client).checkout;
				assert(isRevertibleSharedTreeView(view));
				for (let j = 0; j < opsPerRun; j++) {
					view.redoStack.pop()?.revert();
				}
				validateTree(view, finalTreeStates[i]);
			}

			for (const client of finalState.clients) {
				const tree = viewFromState(finalState, client).checkout;
				assert(isRevertibleSharedTreeView(tree));
				tree.unsubscribe();
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			emitter,
			saveFailures: {
				directory: failureDirectory,
			},
		});
	});

	// Generally broken with multiple issues:
	// AB#5747 tracks root-causing these and re-enabling.
	describe.skip("out of order undo matches the initial state", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "undo-out-of-order",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: UndoRedoFuzzTestState) => {
			initialState.initialTreeState = initialState.clients[0].channel.contentSnapshot().tree;
			initialState.anchors = [];
			// creates an initial anchor for each tree
			for (const client of initialState.clients) {
				const tree = viewFromState(initialState, client)
					.checkout as RevertibleSharedTreeView;
				const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);
				tree.undoStack = undoStack;
				tree.redoStack = redoStack;
				tree.unsubscribe = unsubscribe;
				initialState.anchors.push(createAnchors(tree));
			}
		});
		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			const clients = finalState.clients;
			const anchors = finalState.anchors ?? assert.fail("Anchors should be defined");

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
				const tree = viewFromState(finalState, finalState.clients[clientIndex]).checkout;
				assert(isRevertibleSharedTreeView(tree));
				tree.undoStack.pop()?.revert();
			}
			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();

			// validate the current state of the clients with the initial state, and check anchor stability
			assert(finalState.anchors !== undefined);
			for (const [i, client] of finalState.clients.entries()) {
				const tree = viewFromState(finalState, client).checkout;
				assert(finalState.initialTreeState !== undefined);
				validateTree(tree, finalState.initialTreeState);
				validateAnchors(tree, anchors[i], true);
			}

			for (const client of finalState.clients) {
				const tree = viewFromState(finalState, client).checkout;
				assert(isRevertibleSharedTreeView(tree));
				tree.unsubscribe();
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			emitter,
			detachedStartOptions: {
				numOpsBeforeAttach: 0,
			},
			saveFailures: {
				directory: failureDirectory,
			},
			skipMinimization: true,
		});
	});

	const unSequencedUndoRedoWeights: Partial<EditGeneratorOpWeights> = {
		insert: 1,
		remove: 1,
		undo: 1,
		redo: 1,
	};

	// These tests generally fail with 0x370 and 0x7aa.
	// See the test case "can rebase over successive sets" for a minimized version of 0x370.
	// 0x7aa needs to be root-caused.
	describe.skip("synchronization after calling undo on unsequenced edits", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(unSequencedUndoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "undo-unsequenced",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: validateTreeConsistency,
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

		emitter.on("testStart", (initialState: UndoRedoFuzzTestState) => {
			// set up undo and redo stacks for each client
			for (const client of initialState.clients) {
				const tree = viewFromState(initialState, client)
					.checkout as RevertibleSharedTreeView;
				const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);
				tree.undoStack = undoStack;
				tree.redoStack = redoStack;
				tree.unsubscribe = unsubscribe;
			}
		});

		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();
			const expectedTree = finalState.summarizerClient.channel.contentSnapshot().tree;
			for (const client of finalState.clients) {
				const tree = viewFromState(finalState, client).checkout;
				validateTree(tree, expectedTree);
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			emitter,
			validationStrategy: { type: "fixedInterval", interval: opsPerRun * 2 }, // interval set to prevent synchronization
			// This test is targeted at long-running undo/redo scenarios, so having a single client start detached and later attach
			// is not particularly interesting
			detachedStartOptions: {
				numOpsBeforeAttach: 0,
			},
			saveFailures: {
				directory: failureDirectory,
			},
			skipMinimization: true,
		});
	});
});
