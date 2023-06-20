/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	AsyncGenerator,
	makeRandom,
	SaveInfo,
	takeAsync,
} from "@fluid-internal/stochastic-test-utils";
import { DDSFuzzModel, DDSFuzzTestState } from "@fluid-internal/test-dds-utils";
import {
	createDDSFuzzSuite,
	DDSFuzzHarnessEvents,
	defaultDDSFuzzSuiteOptions,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluid-internal/test-dds-utils/dist/ddsFuzzHarness";
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
import { makeOpGenerator, EditGeneratorOpWeights } from "./fuzzEditGenerators";
import { fuzzReducer } from "./fuzzEditReducers";
import { onCreate, initialTreeState } from "./fuzzUtils";
import { Operation } from "./operationTypes";

export function performFuzzActionsAbort(
	generator: AsyncGenerator<Operation, DDSFuzzTestState<SharedTreeTestFactory>>,
	testCount: number,
	saveInfo?: SaveInfo,
): void {
	const baseModel: DDSFuzzModel<
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

	let firstAnchor: Anchor | undefined;
	const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
	emitter.on("testStart", (initialState: DDSFuzzTestState<SharedTreeTestFactory>) => {
		// building the anchor for anchor stability test
		const cursor = initialState.clients[0].channel.forest.allocateCursor();
		moveToDetachedField(initialState.clients[0].channel.forest, cursor);
		cursor.enterNode(0);
		cursor.getPath();
		cursor.firstField();
		cursor.getFieldKey();
		cursor.enterNode(1);
		firstAnchor = cursor.buildAnchor();
		cursor.free();
		initialState.clients[0].channel.transaction.start();
	});

	emitter.on("testEnd", (finalState: DDSFuzzTestState<SharedTreeTestFactory>) => {
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
		assert(firstAnchor !== undefined);
		const anchorPath = finalState.clients[0].channel.locate(firstAnchor);
		assert(compareUpPaths(expectedPath, anchorPath));
	});

	createDDSFuzzSuite(baseModel, {
		defaultTestCount: testCount,
		numberOfClients: 1,
		emitter,
		saveFailures: saveInfo ? { directory: saveInfo.filepath } : false,
	});
}

export function performFuzzActionsComposeVsIndividual(
	generator: AsyncGenerator<Operation, DDSFuzzTestState<SharedTreeTestFactory>>,
	testCount: number,
	saveInfo?: SaveInfo,
): void {
	const baseModel: DDSFuzzModel<
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
	emitter.on("testStart", (initialState: DDSFuzzTestState<SharedTreeTestFactory>) => {
		initialState.clients[0].channel.transaction.start();
	});
	emitter.on("testEnd", (finalState: DDSFuzzTestState<SharedTreeTestFactory>) => {
		const treeViewBeforeCommit = toJsonableTree(finalState.clients[0].channel);
		finalState.clients[0].channel.transaction.commit();
		assert(treeViewBeforeCommit !== undefined);
		validateTree(finalState.clients[0].channel, treeViewBeforeCommit);
	});
	const options = {
		...defaultDDSFuzzSuiteOptions,
		numberOfClients: 1,
		emitter,
	};
	createDDSFuzzSuite(baseModel, {
		defaultTestCount: testCount,
		numberOfClients: 1,
		emitter,
		saveFailures: saveInfo ? { directory: saveInfo.filepath } : false,
	});
}

/**
 * Fuzz tests in this suite are meant to exercise specific code paths or invariants.
 * They should typically use SharedTree's branching APIs to emulate multiple clients concurrently editing the document
 * as that is less computationally expensive and offers greater control over the order of concurrent operations.
 *
 * See the "Fuzz - Top-Level" test suite for tests are more general in scope.
 */
describe.only("Fuzz - Targeted", () => {
	const random = makeRandom(0);
	const runsPerBatch = 20;
	const opsPerRun = 20;
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
		setPayload: 1,
	};
	describe("Anchors are unaffected by aborted transaction", () => {
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		performFuzzActionsAbort(generatorFactory(), opsPerRun);
	});
	const composeVsIndividualWeights: Partial<EditGeneratorOpWeights> = {
		setPayload: 1,
		insert: 1,
		delete: 1,
	};
	describe("Composed vs individual changes converge to the same tree", () => {
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(composeVsIndividualWeights));
		performFuzzActionsComposeVsIndividual(generatorFactory(), opsPerRun);
	});
});
