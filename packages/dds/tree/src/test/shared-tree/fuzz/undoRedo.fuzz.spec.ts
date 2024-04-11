/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { AsyncGenerator, takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	DDSFuzzHarnessEvents,
	DDSFuzzModel,
	DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import {
	Anchor,
	CommitKind,
	JsonableTree,
	Revertible,
	UpPath,
	Value,
} from "../../../core/index.js";
import {
	SharedTreeTestFactory,
	createTestUndoRedoStacks,
	toJsonableTree,
	validateTree,
	validateTreeConsistency,
} from "../../utils.js";

import {
	EditGeneratorOpWeights,
	FuzzTestState,
	makeOpGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { checkTreesAreSynchronized, fuzzReducer } from "./fuzzEditReducers.js";
import {
	RevertibleSharedTreeView,
	createAnchors,
	deterministicIdCompressorFactory,
	failureDirectory,
	fuzzNode,
	initialFuzzSchema,
	onCreate,
	successesDirectory,
	validateAnchors,
} from "./fuzzUtils.js";
import { Operation } from "./operationTypes.js";
import { TreeContent, typeNameSymbol } from "../../../index.js";

interface UndoRedoFuzzTestState extends FuzzTestState {
	initialTreeState?: JsonableTree[];
	undoStack?: Revertible[];
	redoStack?: Revertible[];
	// Parallel array to `clients`: set in testStart
	anchors?: Map<Anchor, [UpPath, Value]>[];
}

const config = {
	schema: initialFuzzSchema,
	initialTree: {
		[typeNameSymbol]: fuzzNode.name,
		sequenceChildren: [
			{
				[typeNameSymbol]: fuzzNode.name,
				sequenceChildren: [11, 12, 13],
				requiredChild: 1,
				optionalChild: undefined,
			},
			{
				[typeNameSymbol]: fuzzNode.name,
				sequenceChildren: [21, 22, 23],
				requiredChild: 2,
				optionalChild: undefined,
			},
			{
				[typeNameSymbol]: fuzzNode.name,
				sequenceChildren: [31, 32, 33],
				requiredChild: 3,
				optionalChild: undefined,
			},
		],
		requiredChild: 0,
		optionalChild: undefined,
	},
} satisfies TreeContent;

describe("Fuzz - undo/redo", () => {
	const runsPerBatch = 100;
	const opsPerRun = 30;

	const undoRedoWeights: Partial<EditGeneratorOpWeights> = {
		set: 3,
		clear: 1,
		insert: 3,
		remove: 1,
		intraFieldMove: 1,
	};

	describe("In-order undo/redo matches the initial/final state", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "In-order undo-redo",
			factory: new SharedTreeTestFactory(() => {}),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: validateTreeConsistency,
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (state: UndoRedoFuzzTestState) => {
			const tree = viewFromState(state, state.clients[0], config.initialTree).checkout;
			state.containerRuntimeFactory.processAllMessages();
			state.initialTreeState = toJsonableTree(tree);
			const undoStack: Revertible[] = [];
			const redoStack: Revertible[] = [];
			state.undoStack = undoStack;
			state.redoStack = redoStack;
			state.anchors = [];
			for (const client of state.clients) {
				const checkout = viewFromState(state, client).checkout;
				checkout.events.on("commitApplied", (commit, getRevertible) => {
					if (getRevertible !== undefined) {
						if (commit.kind === CommitKind.Undo) {
							redoStack.push(getRevertible());
						} else {
							undoStack.push(getRevertible());
						}
					}
				});
				state.anchors.push(createAnchors(checkout));
			}
		});
		emitter.on("testEnd", (state: UndoRedoFuzzTestState) => {
			// synchronize clients
			state.containerRuntimeFactory.processAllMessages();
			checkTreesAreSynchronized(state.clients.map((client) => client.channel));

			const anchors = state.anchors ?? assert.fail("Anchors should be defined");
			const undoStack = state.undoStack ?? assert.fail("undoStack should be defined");
			const redoStack = state.redoStack ?? assert.fail("redoStack should be defined");
			assert(redoStack.length === 0, "redoStack should be empty");

			// Save final tree state to validate redo later
			const tree = viewFromState(state, state.clients[0]).checkout;
			const stateAfterEdits = toJsonableTree(tree);

			// Undo all the edits in the reverse order they were made
			for (let i = undoStack.length - 1; i >= 0; i -= 1) {
				undoStack[i].revert();
				state.containerRuntimeFactory.processAllMessages();
			}
			checkTreesAreSynchronized(state.clients.map((client) => client.channel));
			assert(redoStack.length === undoStack.length, "redoStack should now be full");

			// Validate that undoing all the edits restored the initial state
			const stateAfterUndos = toJsonableTree(tree);
			assert.deepEqual(stateAfterUndos, state.initialTreeState);

			// Validate that the anchors are still valid after undoing all the edits
			for (const [i, client] of state.clients.entries()) {
				const view = viewFromState(state, client).checkout;
				validateAnchors(view, anchors[i], true);
			}

			// Redo all of the undone edits
			for (let i = redoStack.length - 1; i >= 0; i -= 1) {
				redoStack[i].revert();
				state.containerRuntimeFactory.processAllMessages();
			}
			checkTreesAreSynchronized(state.clients.map((client) => client.channel));

			// Validate that redoing all the edits restored the final state
			const stateAfterRedos = toJsonableTree(tree);
			assert.deepEqual(stateAfterRedos, stateAfterEdits);

			// Validate that the anchors are still valid after redoing all the edits
			for (const [i, client] of state.clients.entries()) {
				const view = viewFromState(state, client).checkout;
				validateAnchors(view, anchors[i], false);
			}
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			detachedStartOptions: {
				numOpsBeforeAttach: 0,
				rehydrateDisabled: true,
				attachingBeforeRehydrateDisable: true,
			},
			emitter,
			saveFailures: {
				directory: failureDirectory,
			},
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
		});
	});

	describe("Out-of-order undo/redo", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "Out-of-order undo-redo",
			factory: new SharedTreeTestFactory(() => {}),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: validateTreeConsistency,
		};
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (state: UndoRedoFuzzTestState) => {
			viewFromState(state, state.clients[0], config.initialTree);
			state.containerRuntimeFactory.processAllMessages();
			const undoStack: Revertible[] = [];
			const redoStack: Revertible[] = [];
			state.undoStack = undoStack;
			state.redoStack = redoStack;
			for (const client of state.clients) {
				const checkout = viewFromState(state, client).checkout;
				checkout.events.on("commitApplied", (commit, getRevertible) => {
					if (getRevertible !== undefined) {
						if (commit.kind === CommitKind.Undo) {
							redoStack.push(getRevertible());
						} else {
							undoStack.push(getRevertible());
						}
					}
				});
			}
		});
		emitter.on("testEnd", (state: UndoRedoFuzzTestState) => {
			// synchronize clients
			state.containerRuntimeFactory.processAllMessages();
			checkTreesAreSynchronized(state.clients.map((client) => client.channel));

			const undoStack = state.undoStack ?? assert.fail("undoStack should be defined");
			const redoStack = state.redoStack ?? assert.fail("redoStack should be defined");
			assert(redoStack.length === 0, "redoStack should be empty");

			// Undo all the edits oldest to newest
			for (const revertible of undoStack) {
				revertible.revert();
			}

			state.containerRuntimeFactory.processAllMessages();
			checkTreesAreSynchronized(state.clients.map((client) => client.channel));

			assert(redoStack.length === undoStack.length, "redoStack should now be full");

			// Redo all of the undone edits oldest to newest
			for (const revertible of redoStack) {
				revertible.revert();
			}

			state.containerRuntimeFactory.processAllMessages();
			checkTreesAreSynchronized(state.clients.map((client) => client.channel));
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 3,
			detachedStartOptions: {
				numOpsBeforeAttach: 0,
				rehydrateDisabled: true,
				attachingBeforeRehydrateDisable: true,
			},
			emitter,
			saveSuccesses: {
				directory: successesDirectory,
			},
			saveFailures: {
				directory: failureDirectory,
			},
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
		});
	});

	const unSequencedUndoRedoWeights: Partial<EditGeneratorOpWeights> = {
		set: 2,
		clear: 1,
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
				const view = viewFromState(initialState, client)
					.checkout as RevertibleSharedTreeView;
				const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
				view.undoStack = undoStack;
				view.redoStack = redoStack;
				view.unsubscribe = unsubscribe;
			}
		});

		emitter.on("testEnd", (finalState: UndoRedoFuzzTestState) => {
			// synchronize clients after undo
			finalState.containerRuntimeFactory.processAllMessages();
			const expectedTree = finalState.summarizerClient.channel.contentSnapshot().tree;
			for (const client of finalState.clients) {
				const view = viewFromState(finalState, client).checkout;
				validateTree(view, expectedTree);
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
