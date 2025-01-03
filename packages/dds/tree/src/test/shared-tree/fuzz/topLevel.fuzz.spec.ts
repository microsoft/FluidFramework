/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { validateFuzzTreeConsistency } from "../../utils.js";

import { type EditGeneratorOpWeights, makeOpGenerator } from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	createOnCreate,
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
	const runsPerBatch = 50;
	const opsPerRun = 20;
	// TODO: Enable other types of ops.
	// AB#11436: Currently manually disposing the view when applying the schema op is causing a double dispose issue. Once this issue has been resolved, re-enable schema ops.
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
		set: 3,
		clear: 1,
		insert: 5,
		remove: 5,
		intraFieldMove: 5,
		crossFieldMove: 5,
		start: 1,
		commit: 1,
		abort: 1,
		fieldSelection: { optional: 1, required: 1, sequence: 3, recurse: 3 },
		schema: 0,
		nodeConstraint: 3,
	};
	const generatorFactory = () => takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));
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
			workloadName: "SharedTree",
			factory: new SharedTreeFuzzTestFactory(createOnCreate(undefined)),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: validateFuzzTreeConsistency,
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
			// AB#7162: enabling rehydrate in these tests hits 0x744 and 0x79d. Disabling rehydrate for now
			// and using the default number of ops before attach.
			detachedStartOptions: {
				numOpsBeforeAttach: 5,
				rehydrateDisabled: true,
			},
			reconnectProbability: 0.1,
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
		};
		createDDSFuzzSuite(model, options);
	});

	describe("Batch rebasing", () => {
		const model: DDSFuzzModel<
			SharedTreeFuzzTestFactory,
			Operation,
			DDSFuzzTestState<SharedTreeFuzzTestFactory>
		> = {
			workloadName: "SharedTree rebasing",
			factory: new SharedTreeFuzzTestFactory(FuzzTestOnCreate),
			generatorFactory,
			reducer: fuzzReducer,
			validateConsistency: validateFuzzTreeConsistency,
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
			// AB#7162: see comment above.
			detachedStartOptions: {
				numOpsBeforeAttach: 5,
			},
			saveFailures: {
				directory: failureDirectory,
			},
			idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
		};

		createDDSFuzzSuite(model, options);
	});
});
