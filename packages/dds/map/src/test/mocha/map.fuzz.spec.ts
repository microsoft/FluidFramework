/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { _dirname } from "./dirname.cjs";
import { baseMapModel } from "./fuzzUtils.js";

describe("Map fuzz tests", () => {
	createDDSFuzzSuite(baseMapModel, {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
			stashableClientProbability: 0.2,
		},
		reconnectProbability: 0,
		// Uncomment to replay a particular seed.
		// replay: 0,
		saveFailures: { directory: path.join(_dirname, "../../../src/test/mocha/results/map") },
	});

	createDDSFuzzSuite(
		{ ...baseMapModel, workloadName: "with reconnect" },
		{
			defaultTestCount: 100,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 6,
				clientAddProbability: 0.1,
				stashableClientProbability: 0.2,
			},
			reconnectProbability: 0.1,
			// Uncomment to replay a particular seed.
			// replay: 0,
			saveFailures: {
				directory: path.join(_dirname, "../../../src/test/mocha/results/map-reconnect"),
			},
		},
	);

	createDDSFuzzSuite(
		{ ...baseMapModel, workloadName: "with batches and rebasing" },
		{
			defaultTestCount: 100,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 6,
				clientAddProbability: 0.1,
				stashableClientProbability: 0.2,
			},
			rebaseProbability: 0.2,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			// Uncomment to replay a particular seed.
			// replay: 0,
			saveFailures: {
				directory: path.join(_dirname, "../../../src/test/mocha/results/map-rebase"),
			},
		},
	);
});
