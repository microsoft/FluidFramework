/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { takeAsync } from "@fluid-private/stochastic-test-utils";
import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { describe } from "mocha";

import { _dirname } from "./dirname.cjs";
import {
	baseSharedArrayModel,
	eventEmitterForFuzzHarness,
	makeSharedArrayOperationGenerator,
} from "./fuzzUtils.js";

describe("SharedArray fuzz", () => {
	createDDSFuzzSuite(baseSharedArrayModel, {
		validationStrategy: { type: "fixedInterval", interval: 10 },
		reconnectProbability: 0.15,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 5,
			clientAddProbability: 0.1,
		},
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
			rehydrateDisabled: true,
		},
		rollbackProbability: 0,
		defaultTestCount: 50,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
		skip: [9, 15],
		emitter: eventEmitterForFuzzHarness,
	});

	createDDSFuzzSuite(
		{
			...baseSharedArrayModel,
			workloadName: "insert, delete and move rollback",
			generatorFactory: () =>
				takeAsync(
					100,
					makeSharedArrayOperationGenerator({
						insert: 5,
						delete: 3,
						move: 2,
						insertBulkAfter: 1,
						toggle: 0,
						toggleMove: 0,
					}),
				),
		},
		{
			validationStrategy: { type: "fixedInterval", interval: 10 },
			reconnectProbability: 0.15,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 5,
				clientAddProbability: 0.1,
			},
			detachedStartOptions: {
				numOpsBeforeAttach: 5,
				rehydrateDisabled: true,
			},
			rollbackProbability: 0.2,
			defaultTestCount: 50,
			saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
			emitter: eventEmitterForFuzzHarness,
		},
	);
});
