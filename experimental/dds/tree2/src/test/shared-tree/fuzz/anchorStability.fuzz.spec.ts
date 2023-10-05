/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AsyncGenerator, takeAsync } from "@fluid-internal/stochastic-test-utils";
import {
	DDSFuzzModel,
	DDSFuzzTestState,
	createDDSFuzzSuite,
	DDSFuzzHarnessEvents,
} from "@fluid-internal/test-dds-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { UpPath, Anchor, Value, AllowedUpdateType, JsonableTree } from "../../../core";
import { ISharedTreeView, SharedTree } from "../../../shared-tree";
import { SchemaAware, typeNameSymbol } from "../../../feature-libraries";
import { SharedTreeTestFactory, toJsonableTree, validateTree } from "../../utils";
import { makeOpGenerator, EditGeneratorOpWeights, FuzzTestState } from "./fuzzEditGenerators";
import { fuzzReducer } from "./fuzzEditReducers";
import {
	createAnchors,
	validateAnchors,
	fuzzNode,
	fuzzSchema,
	FuzzNodeSchema,
	failureDirectory,
} from "./fuzzUtils";
import { Operation } from "./operationTypes";

interface AbortFuzzTestState extends FuzzTestState {
	anchors?: Map<Anchor, [UpPath, Value]>[];
}

// Setting the tree to have an initial value is more interesting for this targeted test than if it's empty:
// returning to an empty state is arguably "easier" than returning to a non-empty state after some undos.
const initialTree: SchemaAware.AllowedTypesToTypedTrees<
	SchemaAware.ApiMode.Flexible,
	[FuzzNodeSchema]
> = {
	[typeNameSymbol]: fuzzNode.name,
	sequenceF: [1, 2, 3],
	requiredF: {
		[typeNameSymbol]: fuzzNode.name,
		requiredF: 0,
		optionalF: undefined,
		sequenceF: [4, 5, 6],
	},
	optionalF: undefined,
};

let initialTreeJson: JsonableTree[];
function setInitialJsonTree(view: ISharedTreeView): void {
	const jsonTree = toJsonableTree(view);
	if (initialTreeJson !== undefined) {
		assert.deepEqual(jsonTree, initialTreeJson);
	}
	initialTreeJson = jsonTree;
}

const onCreate = (tree: SharedTree) => {
	const view = tree.schematize({
		schema: fuzzSchema,
		initialTree,
		allowedSchemaModifications: AllowedUpdateType.None,
	});
	setInitialJsonTree(view);
};

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
			// (as of now, they're off as "set" can delete notes which causes the same problems as above)
			fieldSelection: {
				optional: 0,
				value: 0,
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
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};

		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AbortFuzzTestState) => {
			const tree = initialState.clients[0].channel.view;
			tree.transaction.start();
			initialState.anchors = [createAnchors(initialState.clients[0].channel.view)];
		});

		emitter.on("testEnd", (finalState: AbortFuzzTestState) => {
			// aborts any transactions that may still be in progress
			const tree = finalState.clients[0].channel.view;
			tree.transaction.abort();
			validateTree(tree, initialTreeJson);
			const anchors = finalState.anchors;
			assert(anchors !== undefined, "Anchors should be defined");
			validateAnchors(finalState.clients[0].channel.view, anchors[0], true);
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
				value: 0,
				sequence: 2,
				recurse: 1,
			},
		};
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const generator = generatorFactory() as AsyncGenerator<Operation, AbortFuzzTestState>;
		const model: DDSFuzzModel<
			SharedTreeTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeTestFactory>
		> = {
			workloadName: "anchors-undo-redo",
			factory: new SharedTreeTestFactory(onCreate),
			generatorFactory: () => generator,
			reducer: fuzzReducer,
			validateConsistency: () => {},
		};

		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AbortFuzzTestState) => {
			initialState.anchors = [];
			for (const client of initialState.clients) {
				initialState.anchors.push(createAnchors(client.channel.view));
			}
		});

		emitter.on("testEnd", (finalState: AbortFuzzTestState) => {
			const anchors = finalState.anchors;
			assert(anchors !== undefined, "Anchors should be defined");
			for (const [i, client] of finalState.clients.entries()) {
				validateAnchors(client.channel.view, anchors[i], false);
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
