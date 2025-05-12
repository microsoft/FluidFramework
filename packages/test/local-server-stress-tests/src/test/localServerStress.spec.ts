/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";

import { makeGenerator, reducer, saveFailures, type StressOperations } from "../baseModel.js";
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
		validateConsistency: validateConsistencyOfAllDDS,
	};

	createLocalServerStressSuite(model, {
		defaultTestCount: 100,
		// skipMinimization: true,
		// Uncomment to replay a particular seed.
		// replay: 93,
		// only: [28],
		saveFailures,
		// saveSuccesses,
		skip: [
			...[15], // 0x54e
			...[39], // 0xa6f
			...[5, 22, 36], // Number of keys not same
			...[6], // channel maps should be the same size
			...[7], // Number of subDirectories not same,
			...[12], // Rollback op does not match last pending
			...[31, 58, 62, 87], // Client closes due to id compressor related asserts in a fatal codepath
		],
	});
});
