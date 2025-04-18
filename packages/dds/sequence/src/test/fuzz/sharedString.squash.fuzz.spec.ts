/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createDDSFuzzSuite, type DDSFuzzHarnessEvents } from "@fluid-private/test-dds-utils";

import {
	baseSharedStringModel,
	defaultFuzzOptions,
	type PoisonedSharedString,
} from "./fuzzUtils.js";
import { TypedEventEmitter } from "@fluid-internal/client-utils";

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

emitter.on("clientCreate", (client) => {
	const channel = client.channel as PoisonedSharedString;
	channel.poisonedHandleLocations = [];
});

describe.only("SharedString fuzz testing", () => {
	createDDSFuzzSuite(
		{ ...baseSharedStringModel, workloadName: "SharedString default" },
		{
			...defaultFuzzOptions,
			emitter,
			stagingMode: {
				changeStagingModeProbability: 0.1,
			},
			// TODO: Include something like staging state / invariant error / precondition to make minimization work.
			// Right now the failure mode of "another client saw a handle it shouldn't" is too common to occur even when removing ops such that
			// initially valid test cases can become invalid.
			skipMinimization: true,
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
		},
	);
});
