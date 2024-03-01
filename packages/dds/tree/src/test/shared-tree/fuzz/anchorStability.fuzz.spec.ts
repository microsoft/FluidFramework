/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	DDSFuzzModel,
	DDSFuzzTestState,
	createDDSFuzzSuite,
	DDSFuzzHarnessEvents,
} from "@fluid-private/test-dds-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { UpPath, Anchor, Value } from "../../../core/index.js";
import { TreeContent } from "../../../shared-tree/index.js";
import {
	cursorsFromContextualData,
	jsonableTreeFromFieldCursor,
	typeNameSymbol,
} from "../../../feature-libraries/index.js";
import { SharedTreeTestFactory, createTestUndoRedoStacks, validateTree } from "../../utils.js";
import {
	makeOpGenerator,
	EditGeneratorOpWeights,
	FuzzTestState,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	createAnchors,
	validateAnchors,
	fuzzNode,
	fuzzSchema,
	failureDirectory,
	RevertibleSharedTreeView,
	deterministicIdCompressorFactory,
} from "./fuzzUtils.js";
import { Operation } from "./operationTypes.js";

interface AnchorFuzzTestState extends FuzzTestState {
	// Parallel array to `clients`: set in testStart
	anchors?: Map<Anchor, [UpPath, Value]>[];
}

const config = {
	schema: fuzzSchema,
	// Setting the tree to have an initial value is more interesting for this targeted test than if it's empty:
	// returning to an empty state is arguably "easier" than returning to a non-empty state after some undos.
	initialTree: {
		[typeNameSymbol]: fuzzNode.name,
		sequenceChildren: [1, 2, 3],
		requiredChild: {
			[typeNameSymbol]: fuzzNode.name,
			requiredChild: 0,
			optionalChild: undefined,
			sequenceChildren: [4, 5, 6],
		},
		optionalChild: undefined,
	},
} satisfies TreeContent;

const initialTreeJson = jsonableTreeFromFieldCursor(
	cursorsFromContextualData(config, config.schema.rootFieldSchema, config.initialTree),
);

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
		const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
			insert: 1,
			remove: 2,
			move: 2,
			fieldSelection: {
				optional: 1,
				required: 1,
				sequence: 2,
				recurse: 1,
			},
		};
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));

		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "anchors",
			factory: new SharedTreeTestFactory(() => undefined),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};

		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AnchorFuzzTestState) => {
			const tree = viewFromState(
				initialState,
				initialState.clients[0],
				config.initialTree,
			).checkout;
			tree.transaction.start();
			// These tests are hard coded to a single client, so this is fine.
			initialState.anchors = [createAnchors(tree)];
		});

		emitter.on("testEnd", (finalState: AnchorFuzzTestState) => {
			const anchors = finalState.anchors ?? assert.fail("Anchors should be defined");

			// aborts any transactions that may still be in progress
			const tree = viewFromState(finalState, finalState.clients[0]).checkout;
			tree.transaction.abort();
			validateTree(tree, initialTreeJson);
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
		const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
			insert: 2,
			remove: 2,
			move: 2,
			undo: 1,
			redo: 1,
			synchronizeTrees: 1,
			fieldSelection: {
				optional: 1,
				required: 1,
				sequence: 2,
				recurse: 1,
			},
		};
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "anchors-undo-redo",
			factory: new SharedTreeTestFactory(() => undefined),
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
					viewFromState(initialState, client, config.initialTree).checkout;
					// synchronization here (instead of once after this loop) prevents the second client from having to rebase an initialize,
					// which invalidates its view due to schema change.
					initialState.containerRuntimeFactory.processAllMessages();
				}
			}
			initialState.anchors = [];
			for (const client of initialState.clients) {
				const view = viewFromState(initialState, client, config.initialTree)
					.checkout as RevertibleSharedTreeView;
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
			// TODO: AB#6664 tracks investigating and resolving.
			// These seeds encounter issues in delta application (specifically 0x7ce and 0x7cf)
			skip: [0, 19, 38],
		});
	});
});
