/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { createDDSFuzzSuite, type DDSFuzzHarnessEvents } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { SharedMapOracle } from "../mapOracle.js";

import { _dirname } from "./dirname.cjs";
import { baseMapModel } from "./fuzzUtils.js";
import type { ISharedMapWithOracle } from "./oracleUtils.js";

const oracleEmitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

oracleEmitter.on("clientCreate", (client) => {
	const channel = client.channel as ISharedMapWithOracle;

	const mapOracle = new SharedMapOracle(channel);
	channel.sharedMapOracle = mapOracle;
});

describe("Map fuzz tests", () => {
	createDDSFuzzSuite(baseMapModel, {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
			stashableClientProbability: 0.2,
		},
		reconnectProbability: 0,
		emitter: oracleEmitter,
		// Uncomment to replay a particular seed.
		// replay: 0,
		saveFailures: { directory: path.join(_dirname, "../../../src/test/mocha/results/map") },
	});

	createDDSFuzzSuite(
		{ ...baseMapModel, workloadName: "with reconnect" },
		{
			defaultTestCount: 100,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 6,
				clientAddProbability: 0.1,
				stashableClientProbability: 0.2,
			},
			reconnectProbability: 0.1,
			emitter: oracleEmitter,
			// Uncomment to replay a particular seed.
			// replay: 0,
			saveFailures: {
				directory: path.join(_dirname, "../../../src/test/mocha/results/map-reconnect"),
			},
		},
	);

	createDDSFuzzSuite(
		{ ...baseMapModel, workloadName: "with batches and rebasing" },
		{
			defaultTestCount: 100,
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 6,
				clientAddProbability: 0.1,
				stashableClientProbability: 0.2,
			},
			rebaseProbability: 0.2,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			emitter: oracleEmitter,
			// Uncomment to replay a particular seed.
			// replay: 0,
			saveFailures: {
				directory: path.join(_dirname, "../../../src/test/mocha/results/map-rebase"),
			},
		},
	);
});
