/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { join } from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";

import {
	createDDSFuzzSuite,
	type DDSFuzzHarnessEvents,
	type DDSFuzzModel,
	type DDSFuzzTestState,
} from "../../ddsFuzzHarness.js";
import { baseModel, type Operation, SharedNothingFactory } from "../sharedNothing.js";

import { _dirname } from "./dirname.cjs";

interface Configuration {
	version: "current" | "previous";
}
type State = DDSFuzzTestState<SharedNothingFactory, Configuration>;
const resolved: Configuration[] = [];
const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
emitter.on("testEnd", (state) => {
	assert.deepEqual(resolved, [
		{ version: "previous" },
		{ version: "current" },
		{ version: "previous" },
		{ version: "current" },
	]);
	assert.deepEqual(
		state.clients.map((client) => [client.channel.id, client.clientConfiguration]),
		[
			["A", { version: "previous" }],
			["B", { version: "previous" }],
			["C", { version: "current" }],
		],
	);
	assert.deepEqual(state.summarizerClient.clientConfiguration, { version: "current" });
});

const model: DDSFuzzModel<SharedNothingFactory, Operation, State> = {
	...baseModel,
	workloadName: "client configuration replay",
	clientConfiguration: {
		generate: () => assert.fail("Replay must use recorded client configurations."),
		factory: (clientConfiguration) => {
			resolved.push(clientConfiguration);
			return new SharedNothingFactory();
		},
	},
	generatorFactory: () => assert.fail("Replay must use recorded operations."),
	reducer: (state) => {
		assert.equal(state.client.clientConfiguration?.version, "previous");
	},
};

createDDSFuzzSuite(model, {
	defaultTestCount: 5,
	numberOfClients: 2,
	detachedStartOptions: { numOpsBeforeAttach: 1 },
	replay: 0,
	emitter,
	saveFailures: { directory: join(_dirname, "../../../src/test/ddsSuiteCases") },
});
