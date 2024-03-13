/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";
import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";
import {
	defaultIntervalOperationGenerationConfig,
	baseModel,
	defaultFuzzOptions,
	makeIntervalOperationGenerator,
} from "./fuzzUtils.js";

const baseIntervalModel = {
	...baseModel,
	generatorFactory: () =>
		takeAsync(100, makeIntervalOperationGenerator(defaultIntervalOperationGenerationConfig)),
};

describe("IntervalCollection fuzz testing", () => {
	const model = {
		...baseIntervalModel,
		workloadName: "default interval collection",
	};

	createDDSFuzzSuite(model, {
		...defaultFuzzOptions,
		skip: [32, 56, 86],
		// Note: there are some known eventual consistency issues which the tests don't currently reproduce.
		// Search this package for AB#6552 (or look at that work item) for a skipped test and further details.
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("IntervalCollection with stashing", () => {
	const model = {
		...baseIntervalModel,
		workloadName: "default interval collection with stashing",
	};

	createDDSFuzzSuite(model, {
		...defaultFuzzOptions,
		clientJoinOptions: {
			clientAddProbability: 0.1,
			maxNumberOfClients: Number.MAX_SAFE_INTEGER,
			stashableClientProbability: 0.2,
		},
		// AB#7220
		skip: [22, 56, 86],
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("IntervalCollection no reconnect fuzz testing", () => {
	const noReconnectModel = {
		...baseIntervalModel,
		workloadName: "interval collection without reconnects",
	};

	const options = {
		...defaultFuzzOptions,
		skip: [56, 86],
		reconnectProbability: 0.0,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.0,
		},
	};

	createDDSFuzzSuite(noReconnectModel, {
		...options,
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("IntervalCollection fuzz testing with rebased batches", () => {
	const noReconnectWithRebaseModel = {
		...baseIntervalModel,
		workloadName: "interval collection with rebasing",
	};

	createDDSFuzzSuite(noReconnectWithRebaseModel, {
		...defaultFuzzOptions,
		// todo AB#5603
		skip: [46, 56],
		reconnectProbability: 0.0,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.0,
		},
		rebaseProbability: 0.2,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		// Uncomment this line to replay a specific seed from its failure file:
	});
});
