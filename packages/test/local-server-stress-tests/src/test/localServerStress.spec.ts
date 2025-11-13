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
		generatorFactory: () => takeAsync(100, makeGenerator()),
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
		// skipMinimization: true,
		// Use skip, replay, and only properties to control which seeds run.
		skip: [
			11, // container closes with 0xc3d, and then test fails due to closed container
			173, // 0xc3d
		],
	});
});
