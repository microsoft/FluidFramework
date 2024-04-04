/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	DDSFuzzHarnessEvents,
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import { typeNameSymbol } from "../../../feature-libraries/index.js";
import { TreeContent } from "../../../shared-tree/index.js";
import { SharedTreeTestFactory, validateTreeConsistency } from "../../utils.js";

import {
	EditGeneratorOpWeights,
	FuzzTestState,
	makeOpGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	deterministicIdCompressorFactory,
	failureDirectory,
	fuzzNode,
	initialFuzzSchema,
} from "./fuzzUtils.js";
import { Operation } from "./operationTypes.js";
import { TypedEventEmitter } from "@fluid-internal/client-utils";

const config = {
	schema: initialFuzzSchema,
	initialTree: {
		[typeNameSymbol]: fuzzNode.name,
		sequenceChildren: [
			{
				[typeNameSymbol]: fuzzNode.name,
				sequenceChildren: [11, 12, 13],
				requiredChild: 1,
				optionalChild: undefined,
			},
			{
				[typeNameSymbol]: fuzzNode.name,
				sequenceChildren: [21, 22, 23],
				requiredChild: 2,
				optionalChild: undefined,
			},
			{
				[typeNameSymbol]: fuzzNode.name,
				sequenceChildren: [31, 32, 33],
				requiredChild: 3,
				optionalChild: undefined,
			},
		],
		requiredChild: 0,
		optionalChild: undefined,
	},
} satisfies TreeContent;

describe("Fuzz - move", () => {
	const opsPerRun = 20;
	const runsPerBatch = 50;
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
		intraFieldMove: 1,
		crossFieldMove: 3,
		fieldSelection: {
			optional: 0,
			required: 0,
			sequence: 1,
			recurse: 2,
		},
	};
	const generatorFactory = () => takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));

	const model: DDSFuzzModel<
		SharedTreeTestFactory,
		Operation,
		DDSFuzzTestState<SharedTreeTestFactory>
	> = {
		workloadName: "move",
		factory: new SharedTreeTestFactory(() => undefined),
		generatorFactory,
		reducer: fuzzReducer,
		validateConsistency: validateTreeConsistency,
	};

	const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
	emitter.on("testStart", (state: FuzzTestState) => {
		viewFromState(state, state.clients[0], config.initialTree);
	});
	emitter.on("testEnd", (state: FuzzTestState) => {
		viewFromState(state, state.clients[0], config.initialTree);
	});

	const options: Partial<DDSFuzzSuiteOptions> = {
		emitter,
		numberOfClients: 1,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.4,
		},
		defaultTestCount: runsPerBatch,
		saveFailures: {
			directory: failureDirectory,
		},
		// AB#7162: enabling rehydrate in these tests hits 0x744 and 0x79d. Disabling rehydrate for now
		// and using the default number of ops before attach.
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
			rehydrateDisabled: true,
		},
		reconnectProbability: 0.1,
		idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
	};
	createDDSFuzzSuite(model, options);
});
