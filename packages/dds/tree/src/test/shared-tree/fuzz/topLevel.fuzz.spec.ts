/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import {
	deterministicIdCompressorFactory,
	failureDirectory,
	FuzzTestOnCreate,
	SharedTreeFuzzTestFactory,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";
import { baseTreeModel, runsPerBatch } from "./baseModel.js";

const baseOptions: Partial<DDSFuzzSuiteOptions> = {
	numberOfClients: 3,
	clientJoinOptions: {
		maxNumberOfClients: 6,
		clientAddProbability: 0.1,
	},
	reconnectProbability: 0.5,
};

/**
 * Fuzz tests in this suite are meant to exercise as much of the SharedTree code as possible and do so in the most
 * production-like manner possible. For example, these fuzz tests should not utilize branching APIs to emulate
 * multiple clients working on the same document. Instead, they should use multiple SharedTree instances, tied together
 * by a sequencing service. The tests may still use branching APIs because that's part of the normal usage of
 * SharedTree, but not as way to avoid using multiple SharedTree instances.
 *
 * The fuzz tests should validate that the clients do not crash and that their document states do not diverge.
 * See the "Fuzz - Targeted" test suite for tests that validate more specific code paths or invariants.
 */
describe("Fuzz - Top-Level", () => {
	/**
	 * This test suite is meant exercise all public APIs of SharedTree together, as well as all service-oriented
	 * operations (such as summarization and stashed ops).
	 */
	describe("Everything", () => {
		const model: DDSFuzzModel<
			SharedTreeFuzzTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeFuzzTestFactory>
		> = {
			...baseTreeModel,
			workloadName: "SharedTree",
		};

		const options: Partial<DDSFuzzSuiteOptions> = {
			...baseOptions,
			defaultTestCount: runsPerBatch,
			saveFailures: {
				directory: failureDirectory,
			},
			clientJoinOptions: {
				clientAddProbability: 0,
				maxNumberOfClients: 3,
			},
			detachedStartOptions: {
				numOpsBeforeAttach: 5,

				// AB#43127: fully allowing rehydrate after attach is currently not supported in tests (but should be in prod) due to limitations in the test mocks.
				attachingBeforeRehydrateDisable: true,
			},
			reconnectProbability: 0.1,
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
			skip: [
				...[30], //  0x92a
			],
		};
		createDDSFuzzSuite(model, options);
	});

	describe("Batch rebasing", () => {
		const model: DDSFuzzModel<
			SharedTreeFuzzTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeFuzzTestFactory>
		> = {
			...baseTreeModel,
			workloadName: "SharedTree rebasing",
			factory: new SharedTreeFuzzTestFactory(FuzzTestOnCreate),
		};
		const options: Partial<DDSFuzzSuiteOptions> = {
			...baseOptions,
			reconnectProbability: 0.0,
			defaultTestCount: runsPerBatch,
			rebaseProbability: 0.2,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			detachedStartOptions: {
				numOpsBeforeAttach: 5,
				// AB#43127: fully allowing rehydrate after attach is currently not supported in tests (but should be in prod) due to limitations in the test mocks.
				attachingBeforeRehydrateDisable: true,
			},
			saveFailures: {
				directory: failureDirectory,
			},
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
		};

		createDDSFuzzSuite(model, options);
	});
});
