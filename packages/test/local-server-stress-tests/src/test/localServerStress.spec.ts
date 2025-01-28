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
	createLocalServerStressSuite,
	LocalServerStressModel,
	type LocalServerStressState,
} from "../localServerStressHarness";

import { _dirname } from "./dirname.cjs";

interface Noop {
	type: "Noop";
}

const reducer = combineReducers<Noop, LocalServerStressState>({
	Noop: () => {},
});

function makeGenerator(): AsyncGenerator<Noop, LocalServerStressState> {
	const syncGenerator = createWeightedGenerator<Noop, LocalServerStressState>([
		[{ type: "Noop" }, 0.5],
	]);

	return async (state) => syncGenerator(state);
}

describe("Local Server Stress", () => {
	const model: LocalServerStressModel<Noop> = {
		workloadName: "default",
		generatorFactory: () => takeAsync(100, makeGenerator()),
		reducer: async (state, operation) => reducer(state, operation),
		validateConsistency: () => {},
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
		},
		reconnectProbability: 0,
		// Uncomment to replay a particular seed.
		// replay: 0,
		saveFailures: { directory: path.join(_dirname, "../../results") },
		saveSuccesses: { directory: path.join(_dirname, "../../results") },
	});
});
