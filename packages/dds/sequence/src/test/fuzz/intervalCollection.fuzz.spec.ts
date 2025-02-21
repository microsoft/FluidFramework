/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { defaultFuzzOptions, baseIntervalModel } from "./fuzzUtils.js";

describe("IntervalCollection fuzz testing", () => {
	const model = {
		...baseIntervalModel,
		workloadName: "default interval collection",
	};

	createDDSFuzzSuite(model, {
		...defaultFuzzOptions,
		skip: [79],
		// Note: there are some known eventual consistency issues which the tests don't currently reproduce.
		// Search this package for AB#6552 (or look at that work item) for a skipped test and further details.
		// Other relevant work items are AB#7806 and #7807.
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
		skip: [79],
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
		skip: [79],
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
		skip: [79],
		// Uncomment this line to replay a specific seed from its failure file:
	});
});
