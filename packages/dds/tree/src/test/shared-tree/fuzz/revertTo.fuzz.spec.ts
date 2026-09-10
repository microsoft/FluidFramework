/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type AsyncGenerator, takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import { ForestTypeExpensiveDebug } from "../../../shared-tree/index.js";
import { SharedTreeTestFactory, validateFuzzTreeConsistency } from "../../utils.js";

import {
	type EditGeneratorOpWeights,
	type FuzzTestState,
	makeOpGenerator,
} from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	createOnCreate,
	deterministicIdCompressorFactory,
	failureDirectory,
	populatedInitialState,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";

const runsPerBatch = 200;
const opsPerRun = 5;

const weights: Partial<EditGeneratorOpWeights> = {
	fieldSelection: { optional: 0, required: 0, sequence: 1, recurse: 1 },
	crossFieldMove: 6,
	start: 1,
	commit: 5,
	revertTo: 10,
};

describe("Fuzz - revertTo", () => {
	const generatorFactory = (): AsyncGenerator<Operation, FuzzTestState> =>
		takeAsync(opsPerRun, makeOpGenerator(weights));

	const model: DDSFuzzModel<
		SharedTreeTestFactory,
		Operation,
		DDSFuzzTestState<SharedTreeTestFactory>
	> = {
		workloadName: "revert to random past revision",
		factory: new SharedTreeTestFactory(createOnCreate(populatedInitialState), undefined, {
			forest: ForestTypeExpensiveDebug,
		}),
		generatorFactory,
		reducer: fuzzReducer,
		validateConsistency: validateFuzzTreeConsistency,
	};
	const options: Partial<DDSFuzzSuiteOptions> = {
		numberOfClients: 3,
		defaultTestCount: runsPerBatch,
		saveFailures: {
			directory: failureDirectory,
		},
		saveSuccesses: {
			directory: failureDirectory,
		},
		clientJoinOptions: {
			clientAddProbability: 0.1,
			maxNumberOfClients: 3,
		},
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
			// AB#43127: fully allowing rehydrate after attach is currently not supported in tests (but should be in prod) due to limitations in the test mocks.
			attachingBeforeRehydrateDisable: true,
		},
		reconnectProbability: 0.1,
		idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
		skipMinimization: true,
	};
	createDDSFuzzSuite(model, options);
});
