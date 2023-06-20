/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AsyncGenerator, takeAsync } from "@fluid-internal/stochastic-test-utils";
import { DDSFuzzModel, DDSFuzzTestState } from "@fluid-internal/test-dds-utils";
import {
	createDDSFuzzSuite,
	DDSFuzzHarnessEvents,
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
import { makeOpGenerator, EditGeneratorOpWeights, FuzzTestState } from "./fuzzEditGenerators";
import { fuzzReducer } from "./fuzzEditReducers";
import { onCreate, initialTreeState } from "./fuzzUtils";
import { Operation, TreeOperation } from "./operationTypes";

interface AbortFuzzTestState extends FuzzTestState {
	firstAnchor?: Anchor;
}

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
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
		setPayload: 1,
	};
	describe("Anchors are unaffected by aborted transaction", () => {
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const generator = generatorFactory() as AsyncGenerator<TreeOperation, AbortFuzzTestState>;
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
			// building the anchor for anchor stability test
			const cursor = initialState.clients[0].channel.forest.allocateCursor();
			moveToDetachedField(initialState.clients[0].channel.forest, cursor);
			cursor.enterNode(0);
			cursor.getPath();
			cursor.firstField();
			cursor.getFieldKey();
			cursor.enterNode(1);
			initialState.firstAnchor = cursor.buildAnchor();
			cursor.free();
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
					parentField: rootFieldKeySymbol,
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
	const composeVsIndividualWeights: Partial<EditGeneratorOpWeights> = {
		setPayload: 1,
		insert: 1,
		delete: 1,
	};
	describe("Composed vs individual changes converge to the same tree", () => {
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(composeVsIndividualWeights));
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
		emitter.on("testStart", (initialState: DDSFuzzTestState<SharedTreeTestFactory>) => {
			initialState.clients[0].channel.transaction.start();
		});
		emitter.on("testEnd", (finalState: DDSFuzzTestState<SharedTreeTestFactory>) => {
			const treeViewBeforeCommit = toJsonableTree(finalState.clients[0].channel);
			finalState.clients[0].channel.transaction.commit();
			assert(treeViewBeforeCommit !== undefined);
			validateTree(finalState.clients[0].channel, treeViewBeforeCommit);
		});
		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 1,
			emitter,
		});
	});
});
