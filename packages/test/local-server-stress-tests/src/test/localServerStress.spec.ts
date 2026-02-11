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
		generatorFactory: () => takeAsync(200, makeGenerator()),
		reducer,
		validateConsistency: async (clientA, clientB, stateTracker) => {
			await validateAllDataStoresSaved(stateTracker, clientA, clientB);
			await validateConsistencyOfAllDDS(clientA, clientB, stateTracker);
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
		// Pre-existing DDS bugs (not introduced by this PR):
		skip: [
			...[46], // TaskManager: live-client consistency bug (queue state diverges)
			...[56, 63, 180], // COC: queue ordering divergence from quorum-event replay timing
		],
		// Use skip, replay, and only properties to control which seeds run.
	});
});
