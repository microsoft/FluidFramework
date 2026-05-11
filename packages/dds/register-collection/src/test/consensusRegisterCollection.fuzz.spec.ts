/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { baseRegisterCollectionModel, defaultOptions } from "./fuzzUtils.js";

describe("ConsensusRegisterCollection fuzz testing", () => {
	createDDSFuzzSuite(baseRegisterCollectionModel, {
		...defaultOptions,
		// Uncomment this line to replay a specific seed:
		// replay: 0,
		// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	});
});

describe("ConsensusRegisterCollection fuzz testing with rebasing", () => {
	createDDSFuzzSuite(baseRegisterCollectionModel, {
		...defaultOptions,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		rebaseProbability: 0.15,
		// Uncomment this line to replay a specific seed:
		// replay: 0,
		// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	});
});
