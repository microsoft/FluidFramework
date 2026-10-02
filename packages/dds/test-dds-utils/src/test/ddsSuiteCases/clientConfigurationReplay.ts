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
let attempt = 0;
let completedReplays = 0;
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
	completedReplays++;
	if (attempt === 2) {
		throw new Error("Retry after exhausting the replay generator.");
	}
});

const model: DDSFuzzModel<SharedNothingFactory, Operation, State> = {
	...baseModel,
	workloadName: "client configuration replay",
	factory: {
		generateClientConfiguration: () =>
			assert.fail("Replay must use recorded client configurations."),
		getFactory: (clientConfiguration) => {
			resolved.push(clientConfiguration);
			return new SharedNothingFactory();
		},
	},
	generatorFactory: () => assert.fail("Replay must use recorded operations."),
	reducer: (state) => {
		assert.equal(state.client.clientConfiguration?.version, "previous");
		if (attempt === 1) {
			throw new Error("Retry after partially consuming the replay generator.");
		}
	},
};

describe("replay retries", function () {
	this.retries(2);
	beforeEach(() => {
		attempt++;
		resolved.length = 0;
	});
	after(() => {
		assert.equal(attempt, 3);
		assert.equal(completedReplays, 2);
	});
	createDDSFuzzSuite(model, {
		defaultTestCount: 5,
		numberOfClients: 2,
		detachedStartOptions: { numOpsBeforeAttach: 1 },
		replay: 0,
		emitter,
		saveFailures: { directory: join(_dirname, "../../../src/test/ddsSuiteCases") },
	});
});
