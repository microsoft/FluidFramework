/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzHarnessEvents,
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import { SharedTreeTestFactory, validateFuzzTreeConsistency } from "../../utils.js";

import {
	type EditGeneratorOpWeights,
	type FuzzTestState,
	makeOpGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	createOnCreate,
	deterministicIdCompressorFactory,
	failureDirectory,
	populatedInitialState,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";
import { TypedEventEmitter } from "@fluid-internal/client-utils";

describe("Fuzz - move", () => {
	const runsPerBatch = 50;
	const opsPerRun = 30;
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
		intraFieldMove: 1,
		crossFieldMove: 3,
		fieldSelection: {
			optional: 0,
			required: 0,
			sequence: 1,
			recurse: 2,
		},
		start: 1,
		commit: 1,
		abort: 1,
	};
	const generatorFactory = () => takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));

	const model: DDSFuzzModel<
		SharedTreeTestFactory,
		Operation,
		DDSFuzzTestState<SharedTreeTestFactory>
	> = {
		workloadName: "move",
		factory: new SharedTreeTestFactory(createOnCreate(populatedInitialState)),
		generatorFactory,
		reducer: fuzzReducer,
		validateConsistency: validateFuzzTreeConsistency,
	};

	const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
	emitter.on("testStart", (state: FuzzTestState) => {
		viewFromState(state, state.clients[0]);
	});

	const options: Partial<DDSFuzzSuiteOptions> = {
		emitter,
		numberOfClients: 1,
		clientJoinOptions: {
			maxNumberOfClients: 4,
			clientAddProbability: 1,
		},
		defaultTestCount: runsPerBatch,
		saveFailures: {
			directory: failureDirectory,
		},
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
			rehydrateDisabled: true,
		},
		reconnectProbability: 0.1,
		idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
		// TODO: AB#31176 tracks failing seeds when trying to synchronize with move edits.
		skip: [4, 18],
		containerRuntimeOptions: { useProcessMessages: true },
	};
	createDDSFuzzSuite(model, options);
});
