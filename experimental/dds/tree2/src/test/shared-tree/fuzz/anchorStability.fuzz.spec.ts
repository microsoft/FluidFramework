/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncGenerator, takeAsync } from "@fluid-internal/stochastic-test-utils";
import {
	DDSFuzzModel,
	DDSFuzzTestState,
	createDDSFuzzSuite,
	DDSFuzzHarnessEvents,
} from "@fluid-internal/test-dds-utils";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { UpPath, Anchor, Value } from "../../../core";
import { SharedTreeTestFactory, validateTree } from "../../utils";
import { makeOpGenerator, EditGeneratorOpWeights, FuzzTestState } from "./fuzzEditGenerators";
import { fuzzReducer } from "./fuzzEditReducers";
import { onCreate, initialTreeState, createAnchors, validateAnchors } from "./fuzzUtils";
import { Operation } from "./operationTypes";

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
describe("Fuzz - anchor stability", () => {
	const opsPerRun = 20;
	const runsPerBatch = 20;
	describe("Anchors are unaffected by aborted transaction", () => {
		// TODO: Add deletes once anchors are stable across removal and reinsertion
		// TODO: Add moves once we have a generator for them
		const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = { insert: 1 };
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const generator = generatorFactory() as AsyncGenerator<Operation, AbortFuzzTestState>;
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

		let anchors: Map<Anchor, [UpPath, Value]>;
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AbortFuzzTestState) => {
			const tree = initialState.clients[0].channel;
			tree.transaction.start();
			anchors = createAnchors(tree);
		});

		emitter.on("testEnd", (finalState: AbortFuzzTestState) => {
			// aborts any transactions that may still be in progress
			const tree = finalState.clients[0].channel;
			tree.transaction.abort();
			validateTree(tree, [initialTreeState]);
			validateAnchors(finalState.clients[0].channel, anchors, false);
		});

		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 1,
			emitter,
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
		};
		const generatorFactory = () =>
			takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
		const generator = generatorFactory() as AsyncGenerator<Operation, AbortFuzzTestState>;
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

		let anchors: Map<Anchor, [UpPath, Value]>;
		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AbortFuzzTestState) => {
			anchors = createAnchors(initialState.clients[0].channel);
		});

		emitter.on("testEnd", (finalState: AbortFuzzTestState) => {
			validateAnchors(finalState.clients[0].channel, anchors, false);
		});

		createDDSFuzzSuite(model, {
			defaultTestCount: runsPerBatch,
			numberOfClients: 2,
			emitter,
		});
	});
});
