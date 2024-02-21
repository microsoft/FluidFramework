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
	createWeightedAsyncGenerator,
	defaultOptions,
	AsyncGenerator,
	SaveInfo,
	asyncGeneratorFromArray,
	makeRandom,
	performFuzzActionsAsync,
	AsyncReducer,
	combineReducersAsync,
} from "@fluid-private/stochastic-test-utils";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	type IMockContainerRuntimeOptions,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	createChildLogger,
	raiseConnectedEvent,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils";
import {
	MessageType,
	type ISequencedDocumentMessage,
	type ISummaryContent,
	SummaryType,
	type ISummaryNack,
	type IDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { mergeStats } from "@fluidframework/runtime-utils";
import { type ISummaryConfiguration } from "../..";
import {
	IConnectableRuntime,
	Summarizer,
	ISummarizerClientElectionEvents,
	SummaryManager,
	ISummarizerClientElection,
	type IConnectedState,
	type IConnectedEvents,
	SummaryCollection,
	type ISummarizerRuntime,
	type ISummarizerInternalsProvider,
	type ISubmitSummaryOptions,
	type SubmitSummaryResult,
	type IRefreshSummaryAckOptions,
	RunWhileConnectedCoordinator,
	type IGeneratedSummaryStats,
} from "../../summary";
import type { IThrottler } from "../../throttler";

interface Reconnect {
	type: "reconnect";
}

interface NewSummarizer {
	type: "newSummarizer";
}

interface SummaryNack {
	type: "summaryNack";
}

interface SubmitOp {
	type: "submitOp";
}

type SummarizerOperation = Reconnect | NewSummarizer | SummaryNack | SubmitOp;

export interface SummarizerFuzzTestState extends BaseFuzzTestState {
	containerRuntimeFactory: MockContainerRuntimeFactoryForSummarizer;
	containerRuntime: MockContainerRuntimeForSummarizer;
}

export interface ISummarizerOperationGenerationConfig {
	weights?: {
		reconnect: number;
		newSummarizer: number;
		summaryNack: number;
		submitOp: number;
	};
}

const defaultConfig: Required<ISummarizerOperationGenerationConfig> = {
	weights: {
		reconnect: 1,
		newSummarizer: 1,
		summaryNack: 1,
		submitOp: 1,
	},
};

export function summarizerOperationGenerator(
	options: ISummarizerOperationGenerationConfig,
): AsyncGenerator<SummarizerOperation, SummarizerFuzzTestState> {
	const reconnect = async (_state: SummarizerFuzzTestState): Promise<Reconnect> => ({
		type: "reconnect",
	});

	const newSummarizer = async (_state: SummarizerFuzzTestState): Promise<NewSummarizer> => ({
		type: "newSummarizer",
	});

	const summaryNack = async (_state: SummarizerFuzzTestState): Promise<SummaryNack> => ({
		type: "summaryNack",
	});

	const submitOp = async (_state: SummarizerFuzzTestState): Promise<SubmitOp> => ({
		type: "submitOp",
	});

	const usableWeights = options.weights ?? defaultConfig.weights;

	return createWeightedAsyncGenerator<SummarizerOperation, SummarizerFuzzTestState>([
		[reconnect, usableWeights.reconnect],
		[newSummarizer, usableWeights.newSummarizer],
		[summaryNack, usableWeights.summaryNack],
		[submitOp, usableWeights.submitOp],
	]);
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

	// TODO: Validate we can summarize

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

function makeReducer(): AsyncReducer<SummarizerOperation, SummarizerFuzzTestState> {
	const wrapper =
		<T>(
			baseReducer: AsyncReducer<T, SummarizerFuzzTestState>,
		): AsyncReducer<T, SummarizerFuzzTestState> =>
		async (state, operation) => {
			await baseReducer(state, operation);
			state.containerRuntimeFactory.processAllMessages();
		};

	const reducer = combineReducersAsync<SummarizerOperation, SummarizerFuzzTestState>({
		reconnect: async (state: SummarizerFuzzTestState, _op: Reconnect) => {
			// TODO
			state.containerRuntime.connected = false;
			state.containerRuntime.connected = true;
		},
		newSummarizer: async (state: SummarizerFuzzTestState, _op: NewSummarizer) => {
			// TODO
			state.containerRuntime.disposeFn();
			state.containerRuntime = state.containerRuntimeFactory.createContainerRuntime(
				new MockFluidDataStoreRuntime(),
			);
		},
		summaryNack: async (state: SummarizerFuzzTestState, _op: SummaryNack) => {
			// TODO: not sure if it deadlocks between needing to process the SummaryNack and waiting for it
			state.containerRuntime.prepareSummaryNack();
			await state.containerRuntime.summarize();
		},
		submitOp: async (state: SummarizerFuzzTestState, _op: SubmitOp) => {
			// TODO: Need to move things around package-wise since DDS Factories are in different packages
		},
	});

	return wrapper(reducer);
}

export const baseModel: Omit<SummarizerFuzzModel, "workloadName" | "generatorFactory"> = {
	reducer: makeReducer(),
};

class MockContainerRuntimeFactoryForSummarizer extends MockContainerRuntimeFactoryForReconnection {
	override createContainerRuntime(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		overrides?: { minimumSequenceNumber?: number },
	): MockContainerRuntimeForSummarizer {
		const containerRuntime = new MockContainerRuntimeForSummarizer(
			dataStoreRuntime,
			this,
			this.runtimeOptions,
			overrides,
		);
		this.runtimes.add(containerRuntime);
		return containerRuntime;
	}
}

interface IMockContainerRuntimeForSummarizerOptions extends IMockContainerRuntimeOptions {
	summaryConfiguration?: ISummaryConfiguration;
}

const DefaultSummaryConfiguration: ISummaryConfiguration = {
	state: "disableHeuristics",
	maxAckWaitTime: 3 * 60 * 1000, // 3 mins.
	maxOpsSinceLastSummary: 7000,
	initialSummarizerDelayMs: 5 * 1000, // 5 secs.
};

class MockContainerRuntimeForSummarizer
	extends MockContainerRuntimeForReconnection
	implements ISummarizerRuntime, ISummarizerInternalsProvider
{
	public readonly logger = createChildLogger();
	public readonly summarizerClientId: string | undefined;
	public readonly summarizer: Summarizer;

	private readonly summaryManager: SummaryManager;
	private readonly connectedState: MockConnectedState;
	private readonly summaryCollection: SummaryCollection;
	private readonly summarizerClientElection: MockSummarizerClientElection;

	constructor(
		dataStoreRuntime: MockFluidDataStoreRuntime,
		factory: MockContainerRuntimeFactoryForSummarizer,
		runtimeOptions: IMockContainerRuntimeForSummarizerOptions = {},
		overrides?: { minimumSequenceNumber?: number },
	) {
		super(dataStoreRuntime, factory, runtimeOptions, overrides);

		this.deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			this.emit("op", message);
		});

		this.summarizerClientElection = new MockSummarizerClientElection(this.clientId);
		this.connectedState = new MockConnectedState(this.logger, this.clientId);
		this.summaryCollection = new SummaryCollection(this.deltaManager, this.logger);

		const summaryConfiguration: ISummaryConfiguration = {
			...DefaultSummaryConfiguration,
			...runtimeOptions.summaryConfiguration,
		};

		this.summarizer = new Summarizer(
			this /* summarizerRuntime */,
			() => summaryConfiguration /* configurationGetter */,
			this /* ISummarizerInternalsProvider */,
			{} as any /* handleContext */,
			this.summaryCollection,
			async (runtime: IConnectableRuntime) =>
				RunWhileConnectedCoordinator.create(runtime, () => this.deltaManager.active),
		);

		this.summaryManager = new SummaryManager(
			this.summarizerClientElection,
			this.connectedState,
			this.summaryCollection,
			this.logger,
			async () => this.summarizer,
			new MockThrottler(),
		);
		this.summaryManager.start();
	}

	/** Prepare a SummaryNack to be sent by the server */
	public prepareSummaryNack() {
		const contents: ISummaryNack = {
			summaryProposal: {
				summarySequenceNumber: this.deltaManager.lastSequenceNumber,
			},
		};
		this.deltaManager.prepareInboundResponse(MessageType.SummaryNack, contents);
	}

	/** Call on the Summarizer object to summarize */
	public async summarize() {
		const result = this.summarizer.summarizeOnDemand({
			reason: "fuzzTest",
			retryOnFailure: false,
		});
		return Promise.all([
			result.summarySubmitted,
			result.summaryOpBroadcasted,
			result.receivedSummaryAckOrNack,
		]);
	}

	public async submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult> {
		const summaryMessage: ISummaryContent = {
			handle: "",
			head: "",
			message: "",
			parents: [],
		};
		const referenceSequenceNumber = this.deltaManager.lastSequenceNumber;

		const summarizeMessage: IDocumentMessage = {
			type: MessageType.Summarize,
			clientSequenceNumber: 0,
			referenceSequenceNumber,
			contents: summaryMessage,
		};
		this.deltaManager.inbound.push({
			...summarizeMessage,
			clientId: this.clientId,
			sequenceNumber: 0,
			minimumSequenceNumber: 0,
			timestamp: 0,
		});
		this.deltaManager.outbound.push([summarizeMessage]);

		const summaryStats: IGeneratedSummaryStats = {
			...mergeStats(),
			dataStoreCount: 1,
			summarizedDataStoreCount: 1,
			summaryNumber: 1,
		};

		return {
			stage: "submit",
			handle: "",
			clientSequenceNumber: -1,
			referenceSequenceNumber,
			minimumSequenceNumber: -1,
			submitOpDuration: 0,
			uploadDuration: 0,
			generateDuration: 0,
			forcedFullTree: false,
			summaryTree: {
				type: SummaryType.Tree,
				tree: {},
			},
			summaryStats,
		};
	}

	public async refreshLatestSummaryAck(options: IRefreshSummaryAckOptions): Promise<void> {
		// Do nothing
	}

	public setConnectedState(value: boolean) {
		super.setConnectedState(value);

		this.connectedState.setConnectedState(value, this.clientId);
		this.summarizerClientElection.setClientId(this.clientId);
	}

	public closeFn() {
		this.disposeFn();
	}

	public disposed: boolean = false;
	public disposeFn() {
		this.connected = false;
		this.disposed = true;
		this.summaryManager.dispose();
		this.summarizer.dispose();
		this.deltaManager.dispose();
	}
}

class MockSummarizerClientElection
	extends TypedEventEmitter<ISummarizerClientElectionEvents>
	implements ISummarizerClientElection
{
	public electedClientId: string | undefined;
	public electedParentId: string | undefined;

	constructor(clientId: string) {
		super();
		this.setClientId(clientId);
	}

	public setClientId(clientId: string) {
		this.electedClientId = clientId;
		this.electedParentId = clientId;
	}
}

class MockConnectedState extends TypedEventEmitter<IConnectedEvents> implements IConnectedState {
	public connected: boolean = false;

	constructor(
		private readonly logger: ITelemetryLoggerExt,
		public clientId: string,
	) {
		super();
	}

	public setConnectedState(connected: boolean, clientId: string): void {
		if (this.connected === connected) {
			return;
		}
		this.clientId = clientId;

		raiseConnectedEvent(this.logger, this, connected, clientId);
	}
}

class MockThrottler implements IThrottler {
	public getDelay = () => 0;
	public numAttempts = 3;
	public delayWindowMs = 0;
	public maxDelayMs = 0;
	public delayFn = () => 0;
}
