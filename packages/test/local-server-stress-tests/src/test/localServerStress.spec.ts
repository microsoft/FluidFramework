/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";

import {
	ddsModelMinimizers,
	makeGenerator,
	reducer,
	type StressOperations,
	saveFailures,
} from "../baseModel.js";
import { validateAllDataStoresSaved } from "../dataStoreOperations.js";
import { validateConsistencyOfAllDDS } from "../ddsOperations";
import {
	createLocalServerStressSuite,
	LocalServerStressModel,
} from "../localServerStressHarness";

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
		// Pre-existing DDS bugs: seed 54 (ConsensusOrderedCollection consistency).
		skip: [54],
		// Use skip, replay, and only properties to control which seeds run.
	});
});
