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
import { UpPath, Anchor, Value } from "../../../core";
import { TreeContent } from "../../../shared-tree";
import {
	cursorsFromContextualData,
	jsonableTreeFromCursor,
	typeNameSymbol,
} from "../../../feature-libraries";
import { SharedTreeTestFactory, createTestUndoRedoStacks, validateTree } from "../../utils";
import {
	makeOpGenerator,
	EditGeneratorOpWeights,
	FuzzTestState,
	viewFromState,
} from "./fuzzEditGenerators";
import { fuzzReducer } from "./fuzzEditReducers";
import {
	createAnchors,
	validateAnchors,
	fuzzNode,
	fuzzSchema,
	failureDirectory,
	RevertibleSharedTreeView,
} from "./fuzzUtils";
import { Operation } from "./operationTypes";

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

const initialTreeJson = cursorsFromContextualData(
	config,
	config.schema.rootFieldSchema,
	config.initialTree,
).map(jsonableTreeFromCursor);

/**
 * Fuzz tests in this suite are meant to exercise specific code paths or invariants.
 * They should typically use SharedTree's branching APIs to emulate multiple clients concurrently editing the document
 * as that is less computationally expensive and offers greater control over the order of concurrent operations.
 *
 * See the "Fuzz - Top-Level" test suite for tests are more general in scope.
 */
describe("Fuzz - anchor stability", () => {
	const opsPerRun = 20;
	const runsPerBatch = 20;
	describe("Anchors are unaffected by aborted transaction", () => {
		// TODO: Add deletes once anchors are stable across removal and reinsertion
		// TODO: Add moves once we have a generator for them
		const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
			insert: 1,
			// When adding deletes/moves, also consider turning on optional/value fields
			// (as of now, they're off as "set" can delete nodes which causes the same problems as above)
			fieldSelection: {
				optional: 0,
				required: 0,
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
			detachedStartOptions: { enabled: false, attachProbability: 1 },
			clientJoinOptions: { maxNumberOfClients: 1, clientAddProbability: 0 },
		});
	});
	describe("Anchors are stable", () => {
		// TODO: Add deletes once anchors are stable across removal
		// TODO: Add moves once we have a generator for them
		const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
			insert: 2,
			undo: 1,
			redo: 1,
			synchronizeTrees: 1,
			// When adding deletes/moves, also consider turning on optional/value fields
			// (as of now, they're off as "set" can delete notes which causes the same problems as above)
			fieldSelection: {
				optional: 0,
				required: 0,
				sequence: 2,
				recurse: 1,
			},
		};
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const generator = generatorFactory() as AsyncGenerator<Operation, AnchorFuzzTestState>;
		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "anchors-undo-redo",
			factory: new SharedTreeTestFactory(() => undefined),
			generatorFactory: () => generator,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};

		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AnchorFuzzTestState) => {
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
			detachedStartOptions: { enabled: false, attachProbability: 1 },
			numberOfClients: 2,
			emitter,
			saveFailures: {
				directory: failureDirectory,
			},
		});
	});
});
