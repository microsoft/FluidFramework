/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-nodejs-modules */

import { strict as assert } from "assert";
import { mkdirSync, readFileSync } from "fs";
import path from "path";
import {
	BaseFuzzTestState,
	createFuzzDescribe,
	createWeightedGenerator,
	defaultOptions,
	Generator,
	SaveInfo,
	generatorFromArray,
	makeRandom,
	performFuzzActions,
	Reducer,
	combineReducers,
} from "@fluid-private/stochastic-test-utils";
import {
	IMockContainerRuntimeOptions,
	MockContainerRuntimeFactoryForReconnection,
} from "@fluidframework/test-runtime-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { ISummarizer } from "../..";
import { IConnectableRuntime, Summarizer } from "../../summary";

interface Disconnect {
	type: "disconnect";
}

interface SummaryNack {
	type: "summaryNack";
}

interface SubmitOp {
	type: "submitOp";
}

type SummarizerOperation = Disconnect | SummaryNack | SubmitOp;

export interface SummarizerFuzzTestState extends BaseFuzzTestState {
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
	summarizer: ISummarizer;
}

const defaultConfig = {
	weights: {
		disconnect: 1,
		summaryNack: 1,
		submitOp: 1,
	},
};

export function operationGenerator(
	options,
): Generator<SummarizerOperation, SummarizerFuzzTestState> {
	const disconnect = (_state: SummarizerFuzzTestState): Disconnect => ({
		type: "disconnect",
	});

	const summaryNack = (_state: SummarizerFuzzTestState): SummaryNack => ({
		type: "summaryNack",
	});

	const submitOp = (_state: SummarizerFuzzTestState): SubmitOp => ({
		type: "submitOp",
	});

	const usableWeights = options.weights ?? defaultConfig.weights;

	return createWeightedGenerator<SummarizerOperation, SummarizerFuzzTestState>([
		[disconnect, usableWeights.disconnect],
		[summaryNack, usableWeights.summaryNack],
		[submitOp, usableWeights.submitOp],
	]);
}

export interface SummarizerFuzzModel {
	workloadName: string;
	generatorFactory: () => Generator<SummarizerOperation, SummarizerFuzzTestState>;
	reducer: Reducer<SummarizerOperation, SummarizerFuzzTestState>;
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

	/**
	 * Options to be provided to the underlying container runtimes {@link @fluidframework/test-runtime-utils#IMockContainerRuntimeOptions}.
	 * By default nothing will be provided, which means that the runtimes will:
	 * - use FlushMode.Immediate, which means that all ops will be sent as soon as they are produced,
	 * therefore all batches have a single op.
	 * - not use grouped batching.
	 */
	containerRuntimeOptions?: IMockContainerRuntimeOptions;

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

/**
 * @internal
 */
interface HasWorkloadName {
	workloadName: string;
}

function getSaveDirectory(
	model: HasWorkloadName,
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
	options: SummarizerFuzzSuiteOptions,
	seed: number,
): SaveInfo | undefined {
	const directory = getSaveDirectory(model, options);
	if (!directory) {
		return undefined;
	}
	const filepath = path.join(directory, `${seed}.json`);
	return { saveOnFailure: true, filepath };
}

type InternalOptions = Omit<SummarizerFuzzSuiteOptions, "only" | "skip"> & {
	only: Set<number>;
	skip: Set<number>;
};

function isInternalOptions(options: SummarizerFuzzSuiteOptions): options is InternalOptions {
	return options.only instanceof Set && options.skip instanceof Set;
}

export function createSummarizerFuzzSuite(
	model: SummarizerFuzzModel,
	providedOptions?: Partial<SummarizerFuzzSuiteOptions>,
): void {
	const options: SummarizerFuzzSuiteOptions = {
		...defaultSummarizerFuzzSuiteOptions,
		...providedOptions,
		saveFailures: false,
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
					saveInfo !== undefined,
					"Cannot replay a file without a directory to save files in!",
				);
				const operations = options.parseOperations(
					readFileSync(saveInfo.filepath).toString(),
				);

				const replayModel = {
					...model,
					// We lose some type safety here because the options interface isn't generic
					generatorFactory: (): Generator<SummarizerOperation, unknown> =>
						generatorFromArray(operations),
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
function runTestForSeed(
	model: SummarizerFuzzModel,
	options: Omit<SummarizerFuzzSuiteOptions, "only" | "skip">,
	seed: number,
	saveInfo?: SaveInfo,
): SummarizerFuzzTestState {
	const random = makeRandom(seed);
	const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection(
		options.containerRuntimeOptions,
	);

	const initialState: SummarizerFuzzTestState = {
		containerRuntimeFactory,
		random,
		// ! TODO: Properly set up client AB#6951
		summarizer: createSummarizer(),
	};

	options.emitter.emit("testStart", initialState);

	const finalState = performFuzzActions(
		model.generatorFactory(),
		model.reducer,
		initialState,
		saveInfo,
	);

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
	itFn(`seed ${seed}`, () => {
		const inCi = !!process.env.TF_BUILD;
		runTestForSeed(model, options, seed, inCi ? undefined : saveInfo);
	});
}

function makeReducer(): Reducer<SummarizerOperation, SummarizerFuzzTestState> {
	return combineReducers<SummarizerOperation, SummarizerFuzzTestState>({
		disconnect: (state: SummarizerFuzzTestState, op: SummarizerOperation) => {
			// ! TODO AB#6951
		},
		summaryNack: (state: SummarizerFuzzTestState, op: SummarizerOperation) => {
			// ! TODO AB#6951
		},
		submitOp: (state: SummarizerFuzzTestState, op: SummarizerOperation) => {
			// ! TODO AB#6951
		},
	});
}

export const baseModel: Omit<SummarizerFuzzModel, "workloadName" | "generatorFactory"> = {
	reducer: makeReducer(),
};

function createSummarizer(): ISummarizer {
	const obj = {};
	return new Summarizer(
		obj as any /* ISummarizerRuntime */,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		() => obj as any /* configurationGetter */,
		obj as any /* ISummarizerInternalsProvider */,
		obj as any /* handleContext */,
		obj as any /* summaryCollection */,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		async (runtime: IConnectableRuntime) => obj as any /* runCoordinatorCreateFn */,
	);
}
