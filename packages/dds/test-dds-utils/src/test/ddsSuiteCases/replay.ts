/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as path from "node:path";

import type { DDSFuzzModel } from "../../ddsFuzzHarness.js";
import { createDDSFuzzSuite } from "../../ddsFuzzHarness.js";
import type { Operation, SharedNothingFactory } from "../sharedNothing.js";
import { baseModel } from "../sharedNothing.js";

import { _dirname } from "./dirname.cjs";

let currentIndex = 0;
const expectedOps = [
	{ type: "noop", clientId: "B" },
	{ type: "noop", clientId: "C" },
];

const generatorUnreachable: () => Promise<never> = async () => {
	throw new Error("Generator should not be called for a replayed test!");
};

const model: DDSFuzzModel<SharedNothingFactory, Operation> = {
	...baseModel,
	workloadName: "replay",
	generatorFactory: () => generatorUnreachable,
	reducer: (state, op) => {
		assert.deepEqual(op, expectedOps[currentIndex]);
		assert.equal(state.client.channel.id, expectedOps[currentIndex].clientId);
		// Note: the above checks failing if currentIndex goes out of bounds is part of the
		// current spec for `replay`: it avoids running other fuzz test seeds/configurations.
		currentIndex++;
	},
	minimizationTransforms: [],
};

createDDSFuzzSuite(model, {
	defaultTestCount: 5,
	detachedStartOptions: { numOpsBeforeAttach: 0 },
	replay: 2,
	// Note: this should point the replay to the source-controlled 2.json file in this directory.
	saveFailures: { directory: path.join(_dirname, "../../../src/test/ddsSuiteCases") },
});
