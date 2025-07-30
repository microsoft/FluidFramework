/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";

import {
	ddsModelMinimizers,
	makeGenerator,
	saveFailures,
	saveSuccesses,
	type StressOperations,
} from "../baseModel.js";
import { validateConsistencyOfAllDDS } from "../ddsOperations.js";
import {
	createLocalServerStressSuite,
	LocalServerStressModel,
} from "../localServerStressHarness.js";

interface GetPendingLocalState {
	type: "getPendingLocalState";
}

describe("Local Server Stress for getPendingLocalState", () => {
	const model: LocalServerStressModel<StressOperations | GetPendingLocalState> = {
		workloadName: "getPendingLocalState",
		generatorFactory: () => takeAsync(100, makeGenerator()),
		reducer: async (state, op) => {},
		validateConsistency: validateConsistencyOfAllDDS,
		minimizationTransforms: ddsModelMinimizers,
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 100,
		skipMinimization: true,
		saveFailures,
		saveSuccesses,
	});
});
