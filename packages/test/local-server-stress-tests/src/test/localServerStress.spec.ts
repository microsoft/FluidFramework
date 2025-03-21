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

for (let i = 0; i < 200; i++) {
	describe.only("Local Server Stress", () => {
		const model: LocalServerStressModel<StressOperations> = {
			workloadName: `default_${i}`,
			generatorFactory: () => takeAsync(100, makeGenerator()),
			reducer,
			validateConsistency: validateConsistencyOfAllDDS,
		};

		createLocalServerStressSuite(model, {
			defaultTestCount: 100,
			skipMinimization: true,
			// Uncomment to replay a particular seed.
			// replay: 93,
			// only: [28],
			saveFailures,
			// saveSuccesses,
			// TODO (AB#33713): we've seen seeds 43 and 44 fail in the pipeline with errors that might
			// represent bugs in the underlying DDSes. Skipping for now.
			skip: [28],
		});
	});
}
