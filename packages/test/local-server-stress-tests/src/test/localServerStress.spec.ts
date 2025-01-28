/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import {
	type AsyncGenerator,
	combineReducers,
	createWeightedGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";

import {
	createDDSFuzzSuite,
	DDSFuzzModel,
	type DDSFuzzTestState,
} from "../localServerStressHarness";

import { _dirname } from "./dirname.cjs";

interface Noop {
	type: "Noop";
}

const reducer = combineReducers<Noop, DDSFuzzTestState>({
	Noop: () => {},
});

function makeGenerator(): AsyncGenerator<Noop, DDSFuzzTestState> {
	const syncGenerator = createWeightedGenerator<Noop, DDSFuzzTestState>([
		[{ type: "Noop" }, 0.5],
	]);

	return async (state) => syncGenerator(state);
}

describe("Local Server Stress", () => {
	const model: DDSFuzzModel<Noop> = {
		workloadName: "default",
		generatorFactory: () => takeAsync(100, makeGenerator()),
		reducer: async (state, operation) => reducer(state, operation),
		validateConsistency: () => {},
	};

	createDDSFuzzSuite(model, {
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
		saveFailures: { directory: path.join(_dirname, "../../results") },
	});
});
