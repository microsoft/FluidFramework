/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { _dirname } from "./dirname.cjs";
import { baseCounterModel, defaultOptions } from "./fuzzUtils.js";

describe("Counter fuzz testing", () => {
	createDDSFuzzSuite(baseCounterModel, {
		validationStrategy: { type: "fixedInterval", interval: defaultOptions.validateInterval },
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.05,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: defaultOptions.testCount,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
		// TODO: Enable rollback in AB#44705
		rollbackProbability: 0,
		// Uncomment this line to replay a specific seed:
		// replay: 0,
		// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	});
});

describe("Counter fuzz testing with rebasing", () => {
	createDDSFuzzSuite(baseCounterModel, {
		validationStrategy: { type: "fixedInterval", interval: defaultOptions.validateInterval },
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.05,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: defaultOptions.testCount,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		rebaseProbability: 0.15,
		// TODO: Enable rollback in AB#44705
		rollbackProbability: 0,
		// Uncomment this line to replay a specific seed:
		// replay: 0,
		// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	});
});
