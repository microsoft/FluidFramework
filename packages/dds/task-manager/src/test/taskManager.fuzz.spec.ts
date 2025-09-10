/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { _dirname } from "./dirname.cjs";
import { baseTaskManagerModel, defaultOptions } from "./fuzzUtils.js";

describe("TaskManager fuzz testing", () => {
	createDDSFuzzSuite(baseTaskManagerModel, {
		validationStrategy: { type: "fixedInterval", interval: defaultOptions.validateInterval },
		rollbackProbability: 0,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.05,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: defaultOptions.testCount,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
		// Uncomment this line to replay a specific seed:
		// replay: 0,
		// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	});
});

describe("TaskManager fuzz testing with rebasing", () => {
	createDDSFuzzSuite(baseTaskManagerModel, {
		validationStrategy: { type: "fixedInterval", interval: defaultOptions.validateInterval },
		skip: [],
		rebaseProbability: 0.15,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.05,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: defaultOptions.testCount,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
		rollbackProbability: 0,
		// Uncomment this line to replay a specific seed:
		// replay: 0,
		// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	});
});
