/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { describe } from "mocha";

import { _dirname } from "./dirname.cjs";
import { baseSharedArrayModel } from "./fuzzUtils.js";

describe("SharedArray fuzz", () => {
	createDDSFuzzSuite(baseSharedArrayModel, {
		validationStrategy: { type: "fixedInterval", interval: 10 },
		reconnectProbability: 0.15,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 5,
			clientAddProbability: 0.1,
		},
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
			rehydrateDisabled: true,
		},
		defaultTestCount: 50,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
	});
});
