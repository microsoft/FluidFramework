/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import path from "node:path";

import { Operation, SharedNothingFactory, baseModel } from "../sharedNothing";
import { DDSFuzzModel, createDDSFuzzSuite } from "../../ddsFuzzHarness";

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
	reducer: async (state, op) => {
		assert.deepEqual(op, expectedOps[currentIndex]);
		assert.equal(state.client.channel.id, expectedOps[currentIndex].clientId);
		// Note: the above checks failing if currentIndex goes out of bounds is part of the
		// current spec for `replay`: it avoids running other fuzz test seeds/configurations.
		currentIndex++;
	},
};

createDDSFuzzSuite(model, {
	defaultTestCount: 5,
	detachedStartOptions: { enabled: false, attachProbability: 0 },
	replay: 2,
	// Note: this should point the replay to the source-controlled 2.json file in this directory.
	saveFailures: { directory: path.join(__dirname, "../../../src/test/ddsSuiteCases") },
});
