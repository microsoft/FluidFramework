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
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { compareUpPaths, rootFieldKey, UpPath, Anchor } from "../../../core";
import { brand } from "../../../util";
import { SharedTreeTestFactory, validateTree } from "../../utils";
import { makeOpGenerator, EditGeneratorOpWeights, FuzzTestState } from "./fuzzEditGenerators";
import { fuzzReducer } from "./fuzzEditReducers";
import { onCreate, initialTreeState, getFirstAnchor } from "./fuzzUtils";
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
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = { insert: 1 };
	describe("Anchors are unaffected by aborted transaction", () => {
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

		const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
		emitter.on("testStart", (initialState: AbortFuzzTestState) => {
			const firstAnchor = getFirstAnchor(initialState.clients[0].channel);
			initialState.firstAnchor = firstAnchor;
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
					parentField: rootFieldKey,
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
});
