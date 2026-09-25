/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzHarnessEvents,
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import {
	baseTreeModel,
	comparisonForestTreeModel,
	editGeneratorOpWeights,
	runsPerBatch,
} from "./baseModel.js";
import {
	type FuzzTestState,
	makeOpGenerator,
	schemaEditGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import {
	deterministicIdCompressorFactory,
	failureDirectory,
	FuzzTestOnCreate,
	SharedTreeFuzzTestFactory,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";

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
	for (const [baseModel, batchRebasing] of [
		[baseTreeModel, false],
		[comparisonForestTreeModel, false],
		[comparisonForestTreeModel, true],
	] as const) {
		const name = `${baseModel.workloadName} schema and data${batchRebasing ? " batch rebasing" : ""}`;
		describe(`Schema and data - ${name}`, () => {
			const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
			emitter.on("testEnd", (state: FuzzTestState) => {
				for (const client of [...state.clients, state.summarizerClient]) {
					assert.equal(viewFromState(state, client).compatibility.isEquivalent, true);
				}
			});
			createDDSFuzzSuite(
				{
					...baseModel,
					workloadName: name,
					generatorFactory: () => {
						const generate = makeOpGenerator({ ...editGeneratorOpWeights, schema: 1 });
						let first = true;
						return takeAsync(100, async (state: FuzzTestState) => {
							if (first) {
								first = false;
								return schemaEditGenerator(state);
							}
							return generate(state);
						});
					},
				},
				{
					...baseOptions,
					defaultTestCount: 20,
					emitter,
					rollbackProbability: 0,
					clientJoinOptions: { clientAddProbability: 0.1, maxNumberOfClients: 4 },
					detachedStartOptions: {
						numOpsBeforeAttach: 5,
						// AB#43127: the mocks do not support rehydration after attaching.
						attachingBeforeRehydrateDisable: true,
					},
					reconnectProbability: batchRebasing ? 0 : 0.1,
					rebaseProbability: batchRebasing ? 0.2 : 0,
					containerRuntimeOptions: batchRebasing
						? { flushMode: FlushMode.TurnBased, enableGroupedBatching: true }
						: undefined,
					saveFailures: { directory: failureDirectory },
					idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
				},
			);
		});
	}

	/**
	 * This test suite is meant exercise all public APIs of SharedTree together, as well as all service-oriented
	 * operations (such as summarization and stashed ops).
	 */
	describe("Everything - Reference Forest", () => {
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
		createDDSFuzzSuite(baseTreeModel, options);
	});

	describe("Everything - Comparison Forest", () => {
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
		createDDSFuzzSuite(comparisonForestTreeModel, options);
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
			reconnectProbability: 0,
			rollbackProbability: 0,
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
