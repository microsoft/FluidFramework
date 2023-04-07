/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	AsyncGenerator,
	makeRandom,
	performFuzzActionsAsync,
	SaveInfo,
} from "@fluid-internal/stochastic-test-utils";
import { moveToDetachedField, compareUpPaths, rootFieldKeySymbol, UpPath } from "../../../core";
import { brand } from "../../../util";
import { TestTreeProvider, SummarizeType, initializeTestTree, validateTree } from "../../utils";
import {
	FuzzTestState,
	makeOpGenerator,
	Operation,
	EditGeneratorOpWeights,
} from "./fuzzEditGenerators";
import { fuzzReducer } from "./fuzzEditReducers";
import { initialTreeState, runFuzzBatch, testSchema } from "./fuzzUtils";

export async function performFuzzActionsAbort(
	generator: AsyncGenerator<Operation, FuzzTestState>,
	seed: number,
	saveInfo?: SaveInfo,
): Promise<FuzzTestState> {
	const random = makeRandom(seed);
	const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
	const tree = provider.trees[0];

	initializeTestTree(provider.trees[0], initialTreeState, testSchema);
	validateTree(provider.trees[0], [initialTreeState]);

	// building the anchor for anchor stability test
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	cursor.enterNode(0);
	cursor.getPath();
	cursor.firstField();
	cursor.getFieldKey();
	cursor.enterNode(1);
	const firstAnchor = cursor.buildAnchor();
	cursor.free();

	const initialState: FuzzTestState = {
		random,
		testTreeProvider: provider,
		numberOfEdits: 0,
	};

	provider.trees[0].transaction.start();

	const finalState = await performFuzzActionsAsync(
		generator,
		fuzzReducer,
		initialState,
		saveInfo,
	);

	// aborts any transactions that may still be in progress
	const finalTree = provider.trees[0];
	finalTree.transaction.abort();
	validateTree(provider.trees[0], [initialTreeState]);

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
	const anchorPath = tree.locate(firstAnchor);

	assert(compareUpPaths(expectedPath, anchorPath));
	return finalState;
}

/**
 * Fuzz tests in this suite are meant to exercise specific code paths or invariants.
 * They should typically use SharedTree's branching APIs to emulate multiple clients concurrently editing the document
 * as that is less computationally expensive and offers greater control over the order of concurrent operations.
 *
 * See the "Fuzz - Top-Level" test suite for tests are more general in scope.
 */
describe("Fuzz - Targeted", () => {
	const random = makeRandom(0);
	const runsPerBatch = 20;
	const opsPerRun = 20;
	const editGeneratorOpWeights: EditGeneratorOpWeights = {
		setPayload: 1,
	};
	describe("Anchors are unaffected by aborted transaction", () => {
		runFuzzBatch(
			makeOpGenerator,
			performFuzzActionsAbort,
			opsPerRun,
			runsPerBatch,
			random,
			editGeneratorOpWeights,
		);
	});
});
