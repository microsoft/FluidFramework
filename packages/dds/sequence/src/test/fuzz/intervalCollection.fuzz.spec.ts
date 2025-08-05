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
		reconnectProbability: 0.0,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.0,
		},
	} as const;

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
		// Interval collection and obliterate with reconnect+rebase have bugs in the case of repeatedly
		// resubmitting operations. This likely boils down to bugs in normalization which are known (see AB#6552 and AB#34898),
		// but any additional fixes necessary are tracked by AB#31001.
		// These cases should be somewhat rare in practice and the issue occurs at resubmission time, meaning they don't
		// result in data corruption, just data loss.
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
