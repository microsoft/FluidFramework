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
		// replay: 4,
		// only: [30],
		saveFailures,
		// saveSuccesses,
		configurations: { "Fluid.Container.enableOfflineLoad": true },
		skip: [
			/**
			 * Problems loading new client from it's pending state after exiting the staging mode.
			 */
			...[13, 39], // client is closed
			...[19, 82], // The Container is closed and cannot be connected
			...[30, 39, 69, 80], // 0xa21
			...[9, 79], // Number of subDirectories not same
			...[22, 72], // Key not found or value not matching key
			...[26], // Rollback op does not match last pending
			...[34, 35, 38, 45, 46, 71, 91], // Number of keys not same
			...[54], // timeout
		],
	});
});
