/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createEmitter } from "@fluid-internal/client-utils";
import { type AsyncGenerator, takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzHarnessEvents,
	type DDSFuzzModel,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import {
	type Anchor,
	CommitKind,
	type JsonableTree,
	type Revertible,
	type UpPath,
	type Value,
} from "../../../core/index.js";
import {
	SharedTreeTestFactory,
	toJsonableTree,
	validateFuzzTreeConsistency,
} from "../../utils.js";

import {
	type EditGeneratorOpWeights,
	type FuzzTestState,
	makeOpGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { checkTreesAreSynchronized, fuzzReducer } from "./fuzzEditReducers.js";
import {
	createAnchors,
	createOnCreate,
	deterministicIdCompressorFactory,
	failureDirectory,
	populatedInitialState,
	validateAnchors,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";

interface UndoRedoFuzzTestState extends FuzzTestState {
	initialTreeState?: JsonableTree[];
	undoStack?: Revertible[];
	redoStack?: Revertible[];
	// Parallel array to `clients`: set in testStart
	anchors?: Map<Anchor, [UpPath, Value]>[];
	unsubscribe?: (() => void)[];
}

describe("Fuzz - revert", () => {
	const runsPerBatch = 20;
	const opsPerRun = 20;

	const undoRedoWeights: Partial<EditGeneratorOpWeights> = {
		set: 3,
		clear: 1,
		insert: 3,
		remove: 1,
		intraFieldMove: 1,
		crossFieldMove: 1,
	};

	describe("revert sequenced commits last-to-first", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "revert sequenced commits last-to-first",
			factory: new SharedTreeTestFactory(createOnCreate(populatedInitialState)),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: validateFuzzTreeConsistency,
		};
		const emitter = createEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (state: UndoRedoFuzzTestState) => {
			init(state);
			state.anchors = [];
			for (const client of state.clients) {
				const checkout = viewFromState(state, client).checkout;
				state.anchors.push(createAnchors(checkout));
			}
		});
		emitter.on("testEnd", (state: UndoRedoFuzzTestState) => {
			// synchronize clients
			state.containerRuntimeFactory.processAllMessages();
			checkTreesAreSynchronized(state.clients.map((client) => client));

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
			checkTreesAreSynchronized(state.clients.map((client) => client));
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
			checkTreesAreSynchronized(state.clients.map((client) => client));

			// Validate that redoing all the edits restored the final state
			const stateAfterRedos = toJsonableTree(tree);
			assert.deepEqual(stateAfterRedos, stateAfterEdits);

			// Validate that the anchors are still valid after redoing all the edits
			for (const [i, client] of state.clients.entries()) {
				const view = viewFromState(state, client).checkout;
				validateAnchors(view, anchors[i], false);
			}

			tearDown(state);
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

	describe("revert unsequenced commits first-to-last", () => {
		const generatorFactory = (): AsyncGenerator<Operation, UndoRedoFuzzTestState> =>
			takeAsync(opsPerRun, makeOpGenerator(undoRedoWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "revert unsequenced commits first-to-last",
			factory: new SharedTreeTestFactory(createOnCreate(populatedInitialState)),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: validateFuzzTreeConsistency,
		};
		const emitter = createEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", init);
		emitter.on("testEnd", (state: UndoRedoFuzzTestState) => {
			const undoStack = state.undoStack ?? assert.fail("undoStack should be defined");
			const redoStack = state.redoStack ?? assert.fail("redoStack should be defined");
			assert(redoStack.length === 0, "redoStack should be empty");

			// Undo all the edits oldest to newest
			for (const revertible of undoStack) {
				revertible.revert();
			}

			assert(redoStack.length === undoStack.length, "redoStack should now be full");

			// Redo all of the undone edits oldest to newest
			for (const revertible of redoStack) {
				revertible.revert();
			}

			state.containerRuntimeFactory.processAllMessages();
			checkTreesAreSynchronized(state.clients.map((client) => client));

			tearDown(state);
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
});

function init(state: UndoRedoFuzzTestState) {
	const tree = viewFromState(state, state.clients[0]).checkout;
	state.initialTreeState = toJsonableTree(tree);
	state.containerRuntimeFactory.processAllMessages();
	const undoStack: Revertible[] = [];
	const redoStack: Revertible[] = [];
	state.undoStack = undoStack;
	state.redoStack = redoStack;
	state.unsubscribe = [];
	for (const client of state.clients) {
		const checkout = viewFromState(state, client).checkout;
		const unsubscribe = checkout.events.on("changed", (commit, getRevertible) => {
			if (getRevertible !== undefined) {
				if (commit.kind === CommitKind.Undo) {
					redoStack.push(getRevertible());
				} else {
					undoStack.push(getRevertible());
				}
			}
		});
		state.unsubscribe.push(unsubscribe);
	}
}

function tearDown(state: UndoRedoFuzzTestState) {
	for (const unsubscribe of state.unsubscribe ??
		assert.fail("unsubscribe array should be defined")) {
		unsubscribe();
	}
}
