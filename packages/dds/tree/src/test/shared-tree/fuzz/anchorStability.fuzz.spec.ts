/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzHarnessEvents,
	type DDSFuzzModel,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import type { Anchor, JsonableTree, UpPath, Value } from "../../../core/index.js";
import { SharedTreeTestFactory, createTestUndoRedoStacks, validateTree } from "../../utils.js";

import {
	type EditGeneratorOpWeights,
	type FuzzTestState,
	makeOpGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	type RevertibleSharedTreeView,
	createAnchors,
	deterministicIdCompressorFactory,
	failureDirectory,
	validateAnchors,
	type FuzzNode,
	createOnCreate,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";
import type { NodeBuilderData } from "../../../internalTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { jsonableTreeFromForest } from "../../../feature-libraries/treeTextCursor.js";

interface AnchorFuzzTestState extends FuzzTestState {
	// Parallel array to `clients`: set in testStart
	anchors?: Map<Anchor, [UpPath, Value]>[];
	initialJsonableTree?: JsonableTree[];
}

const initialTreeState: NodeBuilderData<typeof FuzzNode> = {
	arrayChildren: [1, 2, 3],
	requiredChild: {
		requiredChild: 0,
		arrayChildren: [4, 5, 6],
	},
	optionalChild: undefined,
} as unknown as NodeBuilderData<typeof FuzzNode>;

/**
 * Fuzz tests in this suite are meant to exercise specific code paths or invariants.
 * They should typically use SharedTree's branching APIs to emulate multiple clients concurrently editing the document
 * as that is less computationally expensive and offers greater control over the order of concurrent operations.
 *
 * See the "Fuzz - Top-Level" test suite for tests are more general in scope.
 */
describe("Fuzz - anchor stability", () => {
	const opsPerRun = 20;
	const runsPerBatch = 50;
	describe("Anchors are unaffected by aborted transaction", () => {
		// AB#11436: Currently manually disposing the view when applying the schema op is causing a double dispose issue. Once this issue has been resolved, re-enable schema ops.
		const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
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
			schema: 0,
		};
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "anchors",
			factory: new SharedTreeTestFactory(createOnCreate(initialTreeState)),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};

		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AnchorFuzzTestState) => {
			const tree = viewFromState(initialState, initialState.clients[0]).checkout;
			tree.transaction.start();
			const initialJsonableTree = jsonableTreeFromForest(tree.forest);
			initialState.initialJsonableTree = initialJsonableTree;
			// These tests are hard coded to a single client, so this is fine.
			initialState.anchors = [createAnchors(tree)];
		});

		emitter.on("testEnd", (finalState: AnchorFuzzTestState) => {
			const anchors = finalState.anchors ?? assert.fail("Anchors should be defined");

			// aborts any transactions that may still be in progress
			const tree = viewFromState(finalState, finalState.clients[0]).checkout;
			tree.transaction.abort();
			assert(finalState.initialJsonableTree !== undefined);
			validateTree(tree, finalState.initialJsonableTree);
			validateAnchors(tree, anchors[0], true);
		});

		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 1,
			emitter,
			saveFailures: {
				directory: failureDirectory,
			},
			// AB#5745: Starting a transaction while detached, submitting edits, then attaching hits 0x428.
			// Once this is fixed, this fuzz test could also include working from a detached state if desired.
			detachedStartOptions: { numOpsBeforeAttach: 0 },
			clientJoinOptions: { maxNumberOfClients: 1, clientAddProbability: 0 },
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
		});
	});
	describe("Anchors are stable", () => {
		// TODO: Currently manually disposing the view when applying the schema op is causing a double dispose issue.
		// Once this issue has been resolved, re-enable schema ops.
		const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
			set: 2,
			clear: 1,
			insert: 2,
			remove: 2,
			intraFieldMove: 2,
			crossFieldMove: 2,
			undo: 1,
			redo: 1,
			synchronizeTrees: 1,
			fieldSelection: {
				optional: 1,
				required: 1,
				sequence: 2,
				recurse: 1,
			},
			schema: 0,
		};
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "anchors-undo-redo",
			factory: new SharedTreeTestFactory(createOnCreate(initialTreeState)),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};

		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AnchorFuzzTestState) => {
			// Kludge: we force schematization and synchronization here to ensure that the clients all have the same
			// starting tree as opposed to isomorphic copies.
			// If we don't do this, then the anchors created below would be destroyed on all but one client (the client
			// whose schematize wins the synchronization race).
			{
				for (const client of initialState.clients) {
					// This is a kludge to force the invocation of schematize for each client.
					// eslint-disable-next-line @typescript-eslint/no-unused-expressions
					viewFromState(initialState, client).checkout;
					// synchronization here (instead of once after this loop) prevents the second client from having to rebase an initialize,
					// which invalidates its view due to schema change.
					initialState.containerRuntimeFactory.processAllMessages();
				}
			}
			initialState.anchors = [];
			for (const client of initialState.clients) {
				const view = viewFromState(initialState, client).checkout as RevertibleSharedTreeView;
				const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
				view.undoStack = undoStack;
				view.redoStack = redoStack;
				view.unsubscribe = unsubscribe;
				initialState.anchors.push(createAnchors(view));
			}
		});

		emitter.on("testEnd", (finalState: AnchorFuzzTestState) => {
			const anchors = finalState.anchors ?? assert.fail("Anchors should be defined");
			for (const [i, client] of finalState.clients.entries()) {
				validateAnchors(viewFromState(finalState, client).checkout, anchors[i], false);
			}
		});

		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			detachedStartOptions: { numOpsBeforeAttach: 0 },
			numberOfClients: 2,
			emitter,
			saveFailures: {
				directory: failureDirectory,
			},
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
			containerRuntimeOptions: { useProcessMessages: true },
		});
	});
});
