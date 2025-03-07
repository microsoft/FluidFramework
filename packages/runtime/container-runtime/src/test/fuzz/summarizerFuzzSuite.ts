/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-nodejs-modules */

import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync } from "node:fs";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	AsyncGenerator,
	AsyncReducer,
	BaseFuzzTestState,
	SaveInfo,
	asyncGeneratorFromArray,
	createFuzzDescribe,
	defaultOptions,
	getSaveDirectory,
	getSaveInfo,
	makeRandom,
	performFuzzActionsAsync,
} from "@fluid-private/stochastic-test-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import type { SummarizerOperation } from "./fuzzUtils.js";
import {
	IMockContainerRuntimeForSummarizerOptions,
	MockContainerRuntimeFactoryForSummarizer,
	MockContainerRuntimeForSummarizer,
} from "./summarizerFuzzMocks.js";

export interface SummarizerFuzzTestState extends BaseFuzzTestState {
	containerRuntimeFactory: MockContainerRuntimeFactoryForSummarizer;
	containerRuntime: MockContainerRuntimeForSummarizer;
}

export interface SummarizerFuzzModel {
	workloadName: string;
	generatorFactory: () => AsyncGenerator<SummarizerOperation, SummarizerFuzzTestState>;
	reducer: AsyncReducer<SummarizerOperation, SummarizerFuzzTestState>;
}

/**
 * @internal
 */
export interface SummarizerFuzzHarnessEvents {
	/**
	 * Raised for each non-summarizer client created during fuzz test execution.
	 */
	(event: "clientCreate", listener: (client: SummarizerFuzzTestState) => void);

	/**
	 * Raised after creating the initialState but prior to performing the fuzzActions..
	 */
	(event: "testStart", listener: (initialState: SummarizerFuzzTestState) => void);

	/**
	 * Raised after all fuzzActions have been completed.
	 */
	(event: "testEnd", listener: (finalState: SummarizerFuzzTestState) => void);
}

/**
 * @internal
 */
export interface SummarizerFuzzSuiteOptions {
	/**
	 * Number of tests to generate for correctness modes (which are run in the PR gate).
	 */
	defaultTestCount: number;

	/**
	 * Event emitter which allows hooking into interesting points of Summarizer harness execution.
	 * Test authors that want to subscribe to any of these events should create a `TypedEventEmitter`,
	 * do so, and pass it in when creating the suite.
	 */
	emitter: TypedEventEmitter<SummarizerFuzzHarnessEvents>;

	/**
	 * Seed which should be replayed from disk.
	 *
	 * This option is intended for quick, by-hand minimization of failure JSON. As such, it adds a `.only`
	 * to the corresponding replay test.
	 */
	replay?: number;

	/**
	 * Runs only the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Runs only seed 42 for the given model.
	 * createSummarizerFuzzSuite(model, { only: [42] });
	 * ```
	 *
	 * @remarks
	 * If you prefer, a variant of the standard `.only` syntax works. See {@link (createSummarizerFuzzSuite:namespace).only}.
	 */
	only: Iterable<number>;

	/**
	 * Skips the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Skips seed 42 for the given model.
	 * createSummarizerFuzzSuite(model, { skip: [42] });
	 * ```
	 *
	 * @remarks
	 * If you prefer, a variant of the standard `.skip` syntax works. See {@link (createSummarizerFuzzSuite:namespace).skip}.
	 */
	skip: Iterable<number>;

	/**
	 * Whether failure files should be saved to disk, and if so, the directory in which they should be saved.
	 * Each seed will be saved in a subfolder of this directory obtained by kebab-casing the model name.
	 *
	 * Turning on this feature is encouraged for quick minimization.
	 */
	saveFailures: false | { directory: string };

	containerRuntimeOptions?: IMockContainerRuntimeForSummarizerOptions;

	parseOperations: (serialized: string) => SummarizerOperation[];
}

/**
 * @internal
 */
export const defaultSummarizerFuzzSuiteOptions: SummarizerFuzzSuiteOptions = {
	defaultTestCount: defaultOptions.defaultTestCount,
	emitter: new TypedEventEmitter(),
	only: [],
	skip: [],
	saveFailures: false,
	parseOperations: (serialized: string) => JSON.parse(serialized) as SummarizerOperation[],
};

export function createSummarizerFuzzSuite(
	model: SummarizerFuzzModel,
	providedOptions?: Partial<SummarizerFuzzSuiteOptions>,
): void {
	const options: SummarizerFuzzSuiteOptions = {
		...defaultSummarizerFuzzSuiteOptions,
		...providedOptions,
	};

	const only = new Set(options.only);
	const skip = new Set(options.skip);
	Object.assign(options, { only, skip });
	assert(isInternalOptions(options));

	const describeFuzz = createFuzzDescribe({ defaultTestCount: options.defaultTestCount });
	describeFuzz(model.workloadName, ({ testCount }) => {
		before(() => {
			if (options.saveFailures !== undefined && options.saveFailures !== false) {
				mkdirSync(getSaveDirectory(options.saveFailures.directory, model), {
					recursive: true,
				});
			}
		});

		for (let seed = 0; seed < testCount; seed++) {
			runTest(model, options, seed, getSaveInfo(model, options, seed));
		}

		if (options.replay !== undefined) {
			const seed = options.replay;
			describe.only(`replay from file`, () => {
				const saveInfo = getSaveInfo(model, options, seed);
				assert(
					saveInfo.saveOnFailure !== false,
					"Cannot replay a file without a directory to save files in!",
				);
				const operations = options.parseOperations(
					readFileSync(saveInfo.saveOnFailure.path).toString(),
				);

				const replayModel = {
					...model,
					// We lose some type safety here because the options interface isn't generic
					generatorFactory: (): AsyncGenerator<SummarizerOperation, unknown> =>
						asyncGeneratorFromArray(operations),
				};
				runTest(replayModel, options, seed, undefined);
			});
		}
	});
}

/**
 * Runs the provided Summarizer fuzz model. All functionality is already assumed to be mixed in.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
async function runTestForSeed(
	model: SummarizerFuzzModel,
	options: Omit<SummarizerFuzzSuiteOptions, "only" | "skip">,
	seed: number,
	saveInfo?: SaveInfo,
): Promise<SummarizerFuzzTestState> {
	const random = makeRandom(seed);
	const containerRuntimeFactory = new MockContainerRuntimeFactoryForSummarizer(
		options.containerRuntimeOptions,
	);

	const containerRuntime = containerRuntimeFactory.createContainerRuntime(
		new MockFluidDataStoreRuntime(),
	);

	const initialState: SummarizerFuzzTestState = {
		containerRuntimeFactory,
		random,
		containerRuntime,
	};

	options.emitter.emit("testStart", initialState);

	const finalState = await performFuzzActionsAsync(
		model.generatorFactory(),
		model.reducer,
		initialState,
		saveInfo,
	);

	const oldRuntime = finalState.containerRuntime;
	oldRuntime.disposeFn();
	const newRuntime = containerRuntimeFactory.createContainerRuntime(
		new MockFluidDataStoreRuntime(),
	);
	await newRuntime.initializeWithStashedOps(oldRuntime);
	await newRuntime.summarize();

	options.emitter.emit("testEnd", finalState);

	return finalState;
}

function runTest(
	model: SummarizerFuzzModel,
	options: InternalOptions,
	seed: number,
	saveInfo: SaveInfo | undefined,
): void {
	const itFn = options.only.has(seed) ? it.only : options.skip.has(seed) ? it.skip : it;
	itFn(`seed ${seed}`, async () => {
		const inCi = !!process.env.TF_BUILD;
		await runTestForSeed(model, options, seed, inCi ? undefined : saveInfo);
	});
}

type InternalOptions = Omit<SummarizerFuzzSuiteOptions, "only" | "skip"> & {
	only: Set<number>;
	skip: Set<number>;
};

function isInternalOptions(options: SummarizerFuzzSuiteOptions): options is InternalOptions {
	return options.only instanceof Set && options.skip instanceof Set;
}
