/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { describe } from "mocha";

import { _dirname } from "./dirname.cjs";
import { baseSharedArrayModel, eventEmitterForFuzzHarness } from "./fuzzUtils.js";

describe("SharedArray fuzz", () => {
	createDDSFuzzSuite(baseSharedArrayModel, {
		validationStrategy: { type: "fixedInterval", interval: 10 },
		reconnectProbability: 0.15,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 5,
			clientAddProbability: 0.1,
			stashableClientProbability: 0.3,
		},
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
		},
		rollbackProbability: 0.2,
		defaultTestCount: 50,
		skip: [
			// Concurrent move/undo-move and delete can resurrect a deleted entry.
			3,
			// Concurrent move and delete/toggle undo can restore an entry at its old position.
			...[14, 42,],
			// Rollback op while attaching state is failing; needs investigation.
			43,
		],
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
		emitter: eventEmitterForFuzzHarness,
	});
});
