/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";

import {
	ddsModelMinimizers,
	makeGenerator,
	reducer,
	saveFailures,
	type StressOperations,
} from "./baseModel.js";
import { validateAllDataStoresSaved } from "./dataStoreOperations.js";
import { validateConsistencyOfAllDDS } from "./ddsOperations.js";
import {
	createLocalServerStressSuite,
	LocalServerStressModel,
} from "./localServerStressHarness.js";

describe("Local Server Stress", () => {
	const model: LocalServerStressModel<StressOperations> = {
		workloadName: "default",
		generatorFactory: () => takeAsync(200, makeGenerator()),
		reducer,
		validateConsistency: async (...clients) => {
			await validateAllDataStoresSaved(...clients);
			await validateConsistencyOfAllDDS(...clients);
		},
		minimizationTransforms: ddsModelMinimizers,
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 200,
		saveFailures,
		configurations: {
			"Fluid.Container.enableOfflineFull": true,
			"Fluid.ContainerRuntime.EnableRollback": true,
		},
		// Minimization is slow with many seeds; use only to minimize specific failing seeds.
		skipMinimization: true,
		// Old seed 54's ordered-collection fuzz check and old Matrix seed 92 are fixed by
		// https://github.com/microsoft/FluidFramework/pull/27579. Seed 92 no longer appears
		// here only because detached blob ops changed the random distribution.
		// Current ConsensusOrderedCollection failures are tracked by
		// https://github.com/microsoft/FluidFramework/issues/28040.
		skip: [0, 180],
		// Use skip, replay, and only properties to control which seeds run.
	});
});
