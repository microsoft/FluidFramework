/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as dirPath from "node:path";

import { takeAsync } from "@fluid-private/stochastic-test-utils";
import { type DDSFuzzModel, createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { DirectoryFactory } from "../../index.js";

import { assertEquivalentDirectories } from "./directoryEquivalenceUtils.js";
import { _dirname } from "./dirname.cjs";
import {
	baseDirModel,
	dirDefaultOptions,
	makeDirOperationGenerator,
	makeDirReducer,
	type DirOperation,
	type DirOperationGenerationConfig,
} from "./fuzzUtils.js";

describe("SharedDirectory fuzz Create/Delete concentrated", () => {
	const options: DirOperationGenerationConfig = {
		setKeyWeight: 0,
		clearKeysWeight: 0,
		deleteKeyWeight: 0,
		createSubDirWeight: 2,
		deleteSubDirWeight: 2,
		maxSubDirectoryChild: 2,
		subDirectoryNamePool: ["dir1", "dir2"],
		validateInterval: dirDefaultOptions.validateInterval,
	};
	const model: DDSFuzzModel<DirectoryFactory, DirOperation> = {
		workloadName: "default directory 1",
		generatorFactory: () => takeAsync(100, makeDirOperationGenerator(options)),
		reducer: makeDirReducer({ clientIds: ["A", "B", "C"], printConsoleLogs: false }),
		validateConsistency: async (a, b) => assertEquivalentDirectories(a.channel, b.channel),
		factory: new DirectoryFactory(),
	};

	createDDSFuzzSuite(model, {
		validationStrategy: {
			type: "fixedInterval",
			interval: dirDefaultOptions.validateInterval,
		},
		reconnectProbability: 0.15,
		numberOfClients: 3,
		// We prevent handles from being generated on the creation/deletion tests since the set operations are disabled.
		handleGenerationDisabled: true,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.08,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: 25,
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 21,
		saveFailures: { directory: dirPath.join(_dirname, "../../../src/test/mocha/results/1") },
	});

	createDDSFuzzSuite(
		{ ...model, workloadName: "default directory 1 with rebasing" },
		{
			validationStrategy: {
				type: "random",
				probability: 0.4,
			},
			rebaseProbability: 0.2,
			reconnectProbability: 0.5,
			// We prevent handles from being generated on the creation/deletion tests since the set operations are disabled.
			handleGenerationDisabled: true,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 3,
				clientAddProbability: 0.08,
				stashableClientProbability: undefined,
			},
			defaultTestCount: 200,
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
			saveFailures: {
				directory: dirPath.join(_dirname, "../../../src/test/mocha/results/1"),
			},
		},
	);
});

describe("SharedDirectory fuzz", () => {
	createDDSFuzzSuite(baseDirModel, {
		validationStrategy: {
			type: "fixedInterval",
			interval: dirDefaultOptions.validateInterval,
		},
		reconnectProbability: 0.15,
		numberOfClients: 3,
		clientJoinOptions: {
			// Note: if tests are slow, we may want to tune this down. This mimics behavior before this suite
			// was refactored to use the DDS fuzz harness.
			maxNumberOfClients: Number.MAX_SAFE_INTEGER,
			clientAddProbability: 0.08,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: 25,
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
		saveFailures: { directory: dirPath.join(_dirname, "../../../src/test/mocha/results/2") },
	});

	createDDSFuzzSuite(
		{ ...baseDirModel, workloadName: "default directory 2 with rebasing" },
		{
			validationStrategy: {
				type: "random",
				probability: 0.4,
			},
			rebaseProbability: 0.2,
			reconnectProbability: 0.5,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			numberOfClients: 3,
			clientJoinOptions: {
				// Note: if tests are slow, we may want to tune this down. This mimics behavior before this suite
				// was refactored to use the DDS fuzz harness.
				maxNumberOfClients: Number.MAX_SAFE_INTEGER,
				clientAddProbability: 0.08,
				stashableClientProbability: undefined,
			},
			defaultTestCount: 200,
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
			saveFailures: {
				directory: dirPath.join(_dirname, "../../../src/test/mocha/results/2"),
			},
		},
	);
});
