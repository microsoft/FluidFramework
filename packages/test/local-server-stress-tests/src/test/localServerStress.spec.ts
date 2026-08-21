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
		// Current ConsensusOrderedCollection failures:
		// seed 0: snapshot/catch-up reconciliation (https://github.com/microsoft/FluidFramework/issues/28040)
		// seed 180: remove-member/requeue ordering (https://github.com/microsoft/FluidFramework/issues/28041)
		// The prior distribution's ConsensusOrderedCollection seed 54 is noted in issue 28040;
		// its Matrix seed 92 is tracked by https://github.com/microsoft/FluidFramework/pull/27579.
		skip: [0, 180],
		// Use skip, replay, and only properties to control which seeds run.
	});
});
