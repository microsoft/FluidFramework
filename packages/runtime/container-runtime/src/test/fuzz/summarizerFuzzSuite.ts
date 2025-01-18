/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-nodejs-modules */

import { strict as assert } from "assert";
import { mkdirSync, readFileSync } from "fs";
import path from "path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	AsyncGenerator,
	AsyncReducer,
	BaseFuzzTestState,
	SaveInfo,
	asyncGeneratorFromArray,
	createFuzzDescribe,
	defaultOptions,
	makeRandom,
	performFuzzActionsAsync,
} from "@fluid-private/stochastic-test-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

// eslint-disable-next-line import/no-deprecated
import type { SummarizerOperation } from "./fuzzUtils.js";
import {
	// eslint-disable-next-line import/no-deprecated
	IMockContainerRuntimeForSummarizerOptions,
	// eslint-disable-next-line import/no-deprecated
	MockContainerRuntimeFactoryForSummarizer,
	// eslint-disable-next-line import/no-deprecated
	MockContainerRuntimeForSummarizer,
} from "./summarizerFuzzMocks.js";

// eslint-disable-next-line import/no-deprecated
export interface SummarizerFuzzTestState extends BaseFuzzTestState {
	// eslint-disable-next-line import/no-deprecated
	containerRuntimeFactory: MockContainerRuntimeFactoryForSummarizer;
	// eslint-disable-next-line import/no-deprecated
	containerRuntime: MockContainerRuntimeForSummarizer;
}

// eslint-disable-next-line import/no-deprecated
export interface SummarizerFuzzModel {
	workloadName: string;
	// eslint-disable-next-line import/no-deprecated
	generatorFactory: () => AsyncGenerator<SummarizerOperation, SummarizerFuzzTestState>;
	// eslint-disable-next-line import/no-deprecated
	reducer: AsyncReducer<SummarizerOperation, SummarizerFuzzTestState>;
}

/**
 * @internal
 */
// eslint-disable-next-line import/no-deprecated
export interface SummarizerFuzzHarnessEvents {
	/**
	 * Raised for each non-summarizer client created during fuzz test execution.
	 */
	// eslint-disable-next-line import/no-deprecated
	(event: "clientCreate", listener: (client: SummarizerFuzzTestState) => void);

	/**
	 * Raised after creating the initialState but prior to performing the fuzzActions..
	 */
	// eslint-disable-next-line import/no-deprecated
	(event: "testStart", listener: (initialState: SummarizerFuzzTestState) => void);

	/**
	 * Raised after all fuzzActions have been completed.
	 */
	// eslint-disable-next-line import/no-deprecated
	(event: "testEnd", listener: (finalState: SummarizerFuzzTestState) => void);
}

/**
 * @internal
 */
// eslint-disable-next-line import/no-deprecated
export interface SummarizerFuzzSuiteOptions {
	/**
	 * Number of tests to generate for correctness modes (which are run in the PR gate).
	 */
	defaultTestCount: number;

	/**
	 *Event emitter which allows hooking into interesting points of Summarizer harness execution.
	 * Test authors that want to subscribe to any of these events should create a `TypedEventEmitter`,
	 * do so, and pass it in when creating the suite.
	 */
	// eslint-disable-next-line import/no-deprecated
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
	 *createSummarizerFuzzSuite(model, { only: [42] });
	 * ```
	 *
	 * @remarks
	 *If you prefer, a variant of the standard `.only` syntax works. See {@link (createSummarizerFuzzSuite:namespace).only}.
	 */
	only: Iterable<number>;

	/**
	 * Skips the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Skips seed 42 for the given model.
	 *createSummarizerFuzzSuite(model, { skip: [42] });
	 * ```
	 *
	 * @remarks
	 *If you prefer, a variant of the standard `.skip` syntax works. See {@link (createSummarizerFuzzSuite:namespace).skip}.
	 */
	skip: Iterable<number>;

	/**
	 * Whether failure files should be saved to disk, and if so, the directory in which they should be saved.
	 * Each seed will be saved in a subfolder of this directory obtained by kebab-casing the model name.
	 *
	 * Turning on this feature is encouraged for quick minimization.
	 */
	saveFailures: false | { directory: string };

	// eslint-disable-next-line import/no-deprecated
	containerRuntimeOptions?: IMockContainerRuntimeForSummarizerOptions;

	// eslint-disable-next-line import/no-deprecated
	parseOperations: (serialized: string) => SummarizerOperation[];
}

/**
 * @internal
 */
// eslint-disable-next-line import/no-deprecated
export const defaultSummarizerFuzzSuiteOptions: SummarizerFuzzSuiteOptions = {
	defaultTestCount: defaultOptions.defaultTestCount,
	emitter: new TypedEventEmitter(),
	only: [],
	skip: [],
	saveFailures: false,
	// eslint-disable-next-line import/no-deprecated
	parseOperations: (serialized: string) => JSON.parse(serialized) as SummarizerOperation[],
};

// eslint-disable-next-line import/no-deprecated
export function createSummarizerFuzzSuite(
	// eslint-disable-next-line import/no-deprecated
	model: SummarizerFuzzModel,
	// eslint-disable-next-line import/no-deprecated
	providedOptions?: Partial<SummarizerFuzzSuiteOptions>,
): void {
	// eslint-disable-next-line import/no-deprecated
	const options: SummarizerFuzzSuiteOptions = {
		// eslint-disable-next-line import/no-deprecated
		...defaultSummarizerFuzzSuiteOptions,
		...providedOptions,
	};

	const only = new Set(options.only);
	const skip = new Set(options.skip);
	Object.assign(options, { only, skip });
	assert(isInternalOptions(options));

	const describeFuzz = createFuzzDescribe({ defaultTestCount: options.defaultTestCount });
	describeFuzz(model.workloadName, ({ testCount }) => {
		const directory = getSaveDirectory(model, options);
		before(() => {
			if (directory !== undefined) {
				mkdirSync(directory, { recursive: true });
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
					// eslint-disable-next-line import/no-deprecated
					generatorFactory: (): AsyncGenerator<SummarizerOperation, unknown> =>
						asyncGeneratorFromArray(operations),
				};
				runTest(replayModel, options, seed, undefined);
			});
		}
	});
}

/**
 *Runs the provided Summarizer fuzz model. All functionality is already assumed to be mixed in.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
async function runTestForSeed(
	// eslint-disable-next-line import/no-deprecated
	model: SummarizerFuzzModel,
	// eslint-disable-next-line import/no-deprecated
	options: Omit<SummarizerFuzzSuiteOptions, "only" | "skip">,
	seed: number,
	saveInfo?: SaveInfo,
	// eslint-disable-next-line import/no-deprecated
): Promise<SummarizerFuzzTestState> {
	const random = makeRandom(seed);
	// eslint-disable-next-line import/no-deprecated
	const containerRuntimeFactory = new MockContainerRuntimeFactoryForSummarizer(
		options.containerRuntimeOptions,
	);

	const containerRuntime = containerRuntimeFactory.createContainerRuntime(
		new MockFluidDataStoreRuntime(),
	);

	// eslint-disable-next-line import/no-deprecated
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
	// eslint-disable-next-line import/no-deprecated
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

/**
 * @internal
 */
interface HasWorkloadName {
	workloadName: string;
}

function getSaveDirectory(
	model: HasWorkloadName,
	// eslint-disable-next-line import/no-deprecated
	options: SummarizerFuzzSuiteOptions,
): string | undefined {
	if (!options.saveFailures) {
		return undefined;
	}
	const workloadFriendly = model.workloadName.replace(/[\s_]+/g, "-").toLowerCase();
	return path.join(options.saveFailures.directory, workloadFriendly);
}

function getSaveInfo(
	model: HasWorkloadName,
	// eslint-disable-next-line import/no-deprecated
	options: SummarizerFuzzSuiteOptions,
	seed: number,
): SaveInfo {
	const directory = getSaveDirectory(model, options);
	if (!directory) {
		return { saveOnFailure: false, saveOnSuccess: false };
	}
	return {
		saveOnFailure: { path: path.join(directory, `${seed}.json`) },
		saveOnSuccess: false,
	};
}

// eslint-disable-next-line import/no-deprecated
type InternalOptions = Omit<SummarizerFuzzSuiteOptions, "only" | "skip"> & {
	only: Set<number>;
	skip: Set<number>;
};

// eslint-disable-next-line import/no-deprecated
function isInternalOptions(options: SummarizerFuzzSuiteOptions): options is InternalOptions {
	return options.only instanceof Set && options.skip instanceof Set;
}
