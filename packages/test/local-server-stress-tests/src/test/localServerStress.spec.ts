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
		defaultTestCount: 100,
		// skipMinimization: true,
		// Uncomment to replay a particular seed.
		// replay: 93,
		only: [54],
		saveFailures,
		// saveSuccesses,
		configurations: { "Fluid.Container.enableOfflineLoad": true },
		skip: [
			...[34, 35, 38, 46, 71, 72, 79, 91, 98], // Number of keys not same
			...[9], // Number of subDirectories not same,
			...[26, 39], // Rollback op does not match last pending
			...[13, 19, 82], // 0xb85
			...[22, 45], // Comparing client client-1 vs client client-0
			...[30, 69, 80], // 0xa21
			...[54], // Forcing timeout before test does
		],
	});
});
