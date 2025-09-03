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
	createDDSFuzzSuite(
		{
			...baseSharedArrayModel,
			workloadName: "insert, move and delete rollback",
			generatorFactory: () =>
				takeAsync(
					100,
					makeSharedArrayOperationGenerator({
						insert: 5,
						delete: 3,
						move: 3,
						insertBulkAfter: 1,
						toggle: 1,
						toggleMove: 1,
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
				stashableClientProbability: 0.3,
			},
			detachedStartOptions: {
				numOpsBeforeAttach: 5,
			},
			rollbackProbability: 0,
			defaultTestCount: 50,
			saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
			skip: [9, 15, 44],
			emitter: eventEmitterForFuzzHarness,
		},
	);

	createDDSFuzzSuite(
		{
			...baseSharedArrayModel,
			workloadName: "insert, move and delete rollback",
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
