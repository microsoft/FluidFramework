/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync } from "node:fs";

import type {
	AsyncGenerator,
	AsyncReducer,
	BaseFuzzTestState,
	BaseOperation,
	IRandom,
	MinimizationTransform,
	SaveDestination,
	SaveInfo,
} from "@fluid-private/stochastic-test-utils";
import {
	ExitBehavior,
	FuzzTestMinimizer,
	asyncGeneratorFromArray,
	chainAsync,
	createFuzzDescribe,
	defaultOptions,
	done,
	generateTestSeeds,
	getSaveDirectory,
	getSaveInfo,
	interleaveAsync,
	isOperationType,
	makeRandom,
	performFuzzActionsAsync,
	saveOpsToFile,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import {
	type ICodeDetailsLoader,
	type IContainer,
	type IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import {
	ConnectionState,
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import {
	createLocalResolverCreateNewRequest,
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { LocalCodeLoader } from "@fluidframework/test-utils/internal";

import {
	createRuntimeFactory,
	StressDataObject,
	type DefaultStressDataObject,
} from "./stressDataObject.js";
import { makeUnreachableCodePathProxy } from "./utils.js";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

export interface Client {
	container: IContainer;
	tag: `client-${number}`;
	entryPoint: DefaultStressDataObject;
}

/**
 * @internal
 */
export interface LocalServerStressState extends BaseFuzzTestState {
	localDeltaConnectionServer: ILocalDeltaConnectionServer;
	codeLoader: ICodeDetailsLoader;
	validationClient: Client;
	random: IRandom;
	clients: Client[];
	client: Client;
	datastore: StressDataObject;
	channel: IChannel;
	isDetached: boolean;
	seed: number;
	tag<T extends string>(prefix: T): `${T}-${number}`;
}

/**
 * @internal
 */
interface SelectedClientSpec {
	clientTag: `client-${number}`;
	datastoreTag: `datastore-${number}`;
	channelTag: `channel-${number}`;
}

/**
 * @internal
 */
interface Attach {
	type: "attach";
}

/**
 * @internal
 */
interface AddClient {
	type: "addClient";
	clientTag: `client-${number}`;
}

/**
 * @internal
 */
interface RemoveClient {
	type: "removeClient";
	clientTag: `client-${number}`;
}

/**
 * @internal
 */
interface Synchronize {
	type: "synchronize";
	clients?: Client[];
}

export interface LocalServerStressModel<TOperation extends BaseOperation> {
	/**
	 * Name for this model. This is used for test case naming, and should generally reflect properties
	 * about the kinds of operations that are generated.
	 * For example, SharedString might fuzz test several different workloads--some involving intervals,
	 * some without, some that never delete text, etc.
	 * This name should also be relatively friendly for file system; if the "save to disk" option of
	 * {@link (createLocalServerStressSuite:function)} is enabled, it will be kebab cased for failure files.
	 */
	workloadName: string;

	/**
	 * Factory which creates a generator for this model.
	 * @remarks DDS model generators can decide to use the "channel" or "client" field to decide which
	 * client to perform the operation on.
	 */
	generatorFactory: () => AsyncGenerator<TOperation, LocalServerStressState>;

	/**
	 * Reducer capable of updating the test state according to the operations generated.
	 */
	reducer: AsyncReducer<TOperation, LocalServerStressState>;

	/**
	 * Equivalence validation function, which should verify that the provided channels contain the same data.
	 * This is run at each synchronization point for all connected clients (as disconnected clients won't
	 * necessarily have the same set of ops applied).
	 * @throws - An informative error if the channels don't have equivalent data.
	 */
	validateConsistency: (channelA: Client, channelB: Client) => void | Promise<void>;

	/**
	 * An array of transforms used during fuzz test minimization to reduce test
	 * cases. See {@link MinimizationTransform} for additional context.
	 *
	 * If no transforms are supplied, minimization will still occur, but the
	 * contents of the operations will remain unchanged.
	 */
	minimizationTransforms?: MinimizationTransform<TOperation>[];
}

/**
 * @internal
 */
export interface LocalServerStressHarnessEvents {
	/**
	 * Raised for each non-summarizer client created during fuzz test execution.
	 */
	(event: "clientCreate", listener: (client: Client) => void);

	/**
	 * Raised after creating the initialState but prior to performing the fuzzActions..
	 */
	(event: "testStart", listener: (initialState: LocalServerStressState) => void);

	/**
	 * Raised after all fuzzActions have been completed.
	 */
	(event: "testEnd", listener: (finalState: LocalServerStressState) => void);

	/**
	 * Raised before each generated operation is run by its reducer.
	 */
	(event: "operationStart", listener: (operation: BaseOperation) => void);
}

/**
 * @internal
 */
export interface LocalServerStressOptions {
	/**
	 * Number of tests to generate for correctness modes (which are run in the PR gate).
	 */
	defaultTestCount: number;

	/**
	 * Number of clients to perform operations on following the attach phase.
	 * This does not include the read-only client created for consistency validation
	 * and summarization--see {@link LocalServerStressState.summarizerClient}.
	 *
	 * See {@link LocalServerStressOptions.detachedStartOptions} for more details on the detached start phase.
	 * See {@link LocalServerStressOptions.clientJoinOptions} for more details on clients joining after those in the initial attach.
	 */
	numberOfClients: number;

	/**
	 * Options dictating if and when to simulate new clients joining the collaboration session.
	 * If not specified, no new clients will be added after the test starts.
	 *
	 * This option is useful for testing eventual consistency bugs related to summarization.
	 *
	 * @remarks Even without enabling this option, DDS fuzz models can generate {@link AddClient}
	 * operations with whatever strategy is appropriate.
	 * This is useful for nudging test cases towards a particular pattern of clients joining.
	 */
	clientJoinOptions: {
		/**
		 * The maximum number of clients that will ever be added to the test.
		 * @remarks Due to current mock limitations, clients will only ever be added to the collaboration session,
		 * not removed.
		 * Adding an excessive number of clients may cause performance issues.
		 */
		maxNumberOfClients: number;

		/**
		 * The probability that a client will be added at any given operation.
		 * If the current number of clients has reached the maximum, this probability is ignored.
		 */
		clientAddProbability: number;
	};

	/**
	 * Dictates simulation of edits made to a DDS while that DDS is detached.
	 *
	 * When enabled, the fuzz test starts with a single client generating edits. After a certain number of ops (dictated by `numOpsBeforeAttach`),
	 * an attach op will be generated, at which point:
	 * - getAttachSummary will be invoked on this client
	 * - The remaining clients (as dictated by {@link LocalServerStressOptions.numberOfClients}) will load from this summary and join the session
	 *
	 * This setup simulates application code initializing state in a data store before attaching it, e.g. running code to edit a DDS from
	 * `DataObject.initializingFirstTime`.
	 * Default: tests are run with this setting enabled, with 5 ops being generated before an attach op. A new client is also rehydrated from
	 * summary. To disable the generation of rehydrate ops, set `rehydrateDisabled` to `true`.
	 */
	detachedStartOptions: {
		numOpsBeforeAttach: number;
	};

	/**
	 * Strategy for validating eventual consistency of DDSes.
	 * In random mode, each generated operation has the specified probability to instead be a synchronization point
	 * (all connected clients process all ops) followed by validation that all clients agree on their shared state.
	 * In fixed interval mode, this synchronization happens on a predictable cadence: every `interval` operations
	 * generated.
	 */
	validationStrategy:
		| { type: "random"; probability: number }
		| { type: "fixedInterval"; interval: number }
		// WIP: This validation strategy still currently synchronizes all clients.
		| { type: "partialSynchronization"; probability: number; clientProbability: number };
	parseOperations: (serialized: string) => BaseOperation[];

	/**
	 * Each non-synchronization option has this probability of instead generating a disconnect/reconnect.
	 * The reconnect operation currently *replaces* the operation generated by the model's generator.
	 *
	 * TODO: Expose options for how to inject reconnection in a more flexible way.
	 */
	reconnectProbability: number;

	/**
	 * Seed which should be replayed from disk.
	 *
	 * This option is intended for quick, by-hand minimization of failure JSON. As such, it adds a `.only`
	 * to the corresponding replay test.
	 *
	 * TODO: Improving workflows around fuzz test minimization, regression test generation for a particular seed,
	 * or more flexibility around replay of test files would be a nice value add to this harness.
	 */
	replay?: number;

	/**
	 * Runs only the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Runs only seed 42 for the given model.
	 * createLocalServerStressSuite(model, { only: [42] });
	 * ```
	 *
	 * @remarks
	 * If you prefer, a variant of the standard `.only` syntax works. See {@link (createLocalServerStressSuite:namespace).only}.
	 */
	only: Iterable<number>;

	/**
	 * Skips the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Skips seed 42 for the given model.
	 * createLocalServerStressSuite(model, { skip: [42] });
	 * ```
	 *
	 * @remarks
	 * If you prefer, a variant of the standard `.skip` syntax works. See {@link (createLocalServerStressSuite:namespace).skip}.
	 */
	skip: Iterable<number>;

	/**
	 * Whether failure files should be saved to disk, and if so, the directory in which they should be saved.
	 * Each seed will be saved in a subfolder of this directory obtained by kebab-casing the model name.
	 *
	 * Turning on this feature is encouraged for quick minimization.
	 */
	saveFailures: undefined | { directory: string };

	/**
	 * Whether successful runs should be saved to disk and where.
	 * Minimization will be skipped for these files.
	 *
	 * This feature is useful to audit the scenarios generated by a given fuzz configuration.
	 */
	saveSuccesses: undefined | { directory: string };

	/**
	 * Whether or not to skip minimization of fuzz failing test cases. This is useful
	 * when one only cares about the counts or types of errors, and not the
	 * exact contents of the test cases.
	 *
	 * Minimization only works when the failure occurs as part of a reducer, and is mostly
	 * useful if the model being tested defines {@link LocalServerStressModel.minimizationTransforms}.
	 *
	 * It can also add a couple seconds of overhead per failing
	 * test case. See {@link MinimizationTransform} for additional context.
	 */
	skipMinimization?: boolean;
}

/**
 * @internal
 */
const defaultLocalServerStressSuiteOptions: LocalServerStressOptions = {
	defaultTestCount: defaultOptions.defaultTestCount,
	detachedStartOptions: {
		numOpsBeforeAttach: 5,
	},
	numberOfClients: 3,
	clientJoinOptions: {
		clientAddProbability: 0.01,
		maxNumberOfClients: 6,
	},
	only: [],
	skip: [],
	parseOperations: (serialized: string) => JSON.parse(serialized) as BaseOperation[],
	reconnectProbability: 0.01,
	saveFailures: undefined,
	saveSuccesses: undefined,
	validationStrategy: { type: "random", probability: 0.05 },
};

/**
 * Mixes in functionality to add new clients to a DDS fuzz model.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
function mixinAddRemoveClient<TOperation extends BaseOperation>(
	model: LocalServerStressModel<TOperation>,
	options: LocalServerStressOptions,
): LocalServerStressModel<TOperation | AddClient | RemoveClient> {
	const generatorFactory: () => AsyncGenerator<
		TOperation | AddClient | RemoveClient,
		LocalServerStressState
	> = () => {
		const baseGenerator = model.generatorFactory();
		return async (
			state: LocalServerStressState,
		): Promise<TOperation | AddClient | RemoveClient | typeof done> => {
			const { clients, random, isDetached, validationClient } = state;
			if (
				options.clientJoinOptions !== undefined &&
				!isDetached &&
				random.bool(options.clientJoinOptions.clientAddProbability)
			) {
				if (clients.length > options.numberOfClients && random.bool()) {
					return {
						type: "removeClient",
						clientTag: random.pick(clients).tag,
					} satisfies RemoveClient;
				}

				if (clients.length < options.clientJoinOptions.maxNumberOfClients) {
					const url = await validationClient.container.getAbsoluteUrl("");
					assert(url !== undefined, "url for client must exist");
					return {
						type: "addClient",
						clientTag: state.tag("client"),
					} satisfies AddClient;
				}
			}
			return baseGenerator(state);
		};
	};

	const minimizationTransforms: MinimizationTransform<
		TOperation | AddClient | RemoveClient
	>[] =
		(model.minimizationTransforms as
			| MinimizationTransform<TOperation | AddClient | RemoveClient>[]
			| undefined) ?? [];

	const reducer: AsyncReducer<
		TOperation | AddClient | RemoveClient,
		LocalServerStressState
	> = async (state, op) => {
		if (isOperationType<AddClient>("addClient", op)) {
			const url = await state.validationClient.container.getAbsoluteUrl("");
			assert(url !== undefined, "url of container must be available");
			const newClient = await loadClient(
				state.localDeltaConnectionServer,
				state.codeLoader,
				op.clientTag,
				url,
				state.seed,
			);
			state.clients.push(newClient);
			return state;
		}
		if (isOperationType<RemoveClient>("removeClient", op)) {
			const removed = state.clients.splice(
				state.clients.findIndex((c) => c.tag === op.clientTag),
				1,
			);
			removed[0].container.dispose();
			return state;
		}
		return model.reducer(state, op);
	};

	return {
		...model,
		minimizationTransforms,
		generatorFactory,
		reducer,
	};
}

/**
 * Mixes in functionality to generate an 'attach' op, which
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
function mixinAttach<TOperation extends BaseOperation>(
	model: LocalServerStressModel<TOperation | AddClient>,
	options: LocalServerStressOptions,
): LocalServerStressModel<TOperation | Attach | AddClient> {
	const { numOpsBeforeAttach } = options.detachedStartOptions;
	const attachOp = async (): Promise<TOperation | Attach | AddClient> => {
		return { type: "attach" };
	};

	const generatorFactory: () => AsyncGenerator<
		TOperation | Attach | AddClient,
		LocalServerStressState
	> = () => {
		const baseGenerator = model.generatorFactory();
		return chainAsync(
			takeAsync(numOpsBeforeAttach, baseGenerator),
			takeAsync(1, attachOp),
			// use addClient ops to create initial clients
			// this allows additional clients to minimized out
			// and keeps repro's simpler
			takeAsync(options.numberOfClients, async (state) => {
				return {
					type: "addClient",
					clientTag: state.tag("client"),
				} satisfies AddClient;
			}),
			baseGenerator,
		);
	};

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | Attach | AddClient>[]
		| undefined;

	const reducer: AsyncReducer<
		TOperation | Attach | AddClient,
		LocalServerStressState
	> = async (state, operation) => {
		if (isOperationType<Attach>("attach", operation)) {
			state.isDetached = false;
			assert.equal(state.clients.length, 1);
			const clientA: Client = state.clients[0];

			await clientA.container.attach(createLocalResolverCreateNewRequest("stress test"));
			const url = await clientA.container.getAbsoluteUrl("");
			assert(url !== undefined, "container must have a url");
			// After attaching, we use a newly loaded client as a read-only client for consistency comparison validation.
			// This makes debugging easier as the state of a client is easier to interpret if it has no local changes.
			// we use the reserved client-0 tag for client, which makes the tags in the test sequential starting at 1
			const validationClient = await loadClient(
				state.localDeltaConnectionServer,
				state.codeLoader,
				"client-0",
				url,
				state.seed,
			);

			return {
				...state,
				isDetached: false,
				validationClient,
			} satisfies LocalServerStressState;
		}
		return model.reducer(state, operation);
	};
	return {
		...model,
		minimizationTransforms,
		generatorFactory,
		reducer,
	};
}

/**
 * Mixes in functionality to generate ops which synchronize all clients and assert the resulting state is consistent.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
function mixinSynchronization<TOperation extends BaseOperation>(
	model: LocalServerStressModel<TOperation>,
	options: LocalServerStressOptions,
): LocalServerStressModel<TOperation | Synchronize> {
	const { validationStrategy } = options;
	let generatorFactory: () => AsyncGenerator<TOperation | Synchronize, LocalServerStressState>;

	switch (validationStrategy.type) {
		case "random": {
			// passing 1 here causes infinite loops. passing close to 1 is wasteful
			// as synchronization + eventual consistency validation should be idempotent.
			// 0.5 is arbitrary but there's no reason anyone should want a probability near this.
			assert(validationStrategy.probability < 0.5, "Use a lower synchronization probability.");
			generatorFactory = (): AsyncGenerator<
				TOperation | Synchronize,
				LocalServerStressState
			> => {
				const baseGenerator = model.generatorFactory();
				return async (
					state: LocalServerStressState,
				): Promise<TOperation | Synchronize | typeof done> =>
					!state.isDetached && state.random.bool(validationStrategy.probability)
						? { type: "synchronize" }
						: baseGenerator(state);
			};
			break;
		}

		case "fixedInterval": {
			generatorFactory = (): AsyncGenerator<
				TOperation | Synchronize,
				LocalServerStressState
			> => {
				const baseGenerator = model.generatorFactory();
				return interleaveAsync<TOperation | Synchronize, LocalServerStressState>(
					baseGenerator,
					async (state) =>
						state.isDetached ? baseGenerator(state) : ({ type: "synchronize" } as const),
					validationStrategy.interval,
					1,
					ExitBehavior.OnEitherExhausted,
				);
			};
			break;
		}

		case "partialSynchronization": {
			// passing 1 here causes infinite loops. passing close to 1 is wasteful
			// as synchronization + eventual consistency validation should be idempotent.
			// 0.5 is arbitrary but there's no reason anyone should want a probability near this.
			assert(validationStrategy.probability < 0.5, "Use a lower synchronization probability.");
			generatorFactory = (): AsyncGenerator<
				TOperation | Synchronize,
				LocalServerStressState
			> => {
				const baseGenerator = model.generatorFactory();
				return async (
					state: LocalServerStressState,
				): Promise<TOperation | Synchronize | typeof done> => {
					if (!state.isDetached && state.random.bool(validationStrategy.probability)) {
						const selectedClients = new Set(
							state.clients
								.filter(
									(client) => client.container.connectionState === ConnectionState.Connected,
								)
								.filter(() => state.random.bool(validationStrategy.clientProbability)),
						);

						return { type: "synchronize", clients: [...selectedClients] };
					} else {
						return baseGenerator(state);
					}
				};
			};
			break;
		}
		default: {
			unreachableCase(validationStrategy);
		}
	}

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | Synchronize>[]
		| undefined;

	const isSynchronizeOp = (op: BaseOperation): op is Synchronize => op.type === "synchronize";
	const reducer: AsyncReducer<TOperation | Synchronize, LocalServerStressState> = async (
		state,
		operation,
	) => {
		// TODO: Only synchronize listed clients if specified
		if (isSynchronizeOp(operation)) {
			const { clients, validationClient } = state;

			const connectedClients = clients.filter((client) => {
				if (client.container.closed || client.container.disposed === true) {
					throw new Error(`Client ${client.tag} is closed`);
				}
				return client.container.connectionState !== ConnectionState.Disconnected;
			});
			connectedClients.push(validationClient);

			if (connectedClients.length > 0) {
				for (const client of connectedClients) {
					try {
						await model.validateConsistency(validationClient, client);
					} catch (error: unknown) {
						if (error instanceof Error) {
							error.message = `Comparing client ${validationClient.tag} vs client ${client.tag}\n${error.message}`;
						}
						throw error;
					}
				}
			}

			return state;
		}
		return model.reducer(state, operation);
	};
	return {
		...model,
		minimizationTransforms,
		generatorFactory,
		reducer,
	};
}

const hasSelectedClientSpec = (op: unknown): op is SelectedClientSpec =>
	(op as SelectedClientSpec).clientTag !== undefined;

/**
 * Mixes in the ability to select a client to perform an operation on.
 * Makes this available to existing generators and reducers in the passed-in model via {@link LocalServerStressState.client}
 * and {@link  @fluid-private/test-dds-utils#LocalServerStressTestState.channel}.
 *
 * @remarks This exists purely for convenience, as "pick a client to perform an operation on" is a common concern.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
function mixinClientSelection<TOperation extends BaseOperation>(
	model: LocalServerStressModel<TOperation>,
	_: LocalServerStressOptions,
): LocalServerStressModel<TOperation> {
	const generatorFactory: () => AsyncGenerator<TOperation, LocalServerStressState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | typeof done> => {
			// Pick a channel, and:
			// 1. Make it available for the DDS model generators (so they don't need to
			// do the boilerplate of selecting a client to perform the operation on)
			// 2. Make it available to the subsequent reducer logic we're going to inject
			// (so that we can recover the channel from serialized data)
			const client = state.random.pick(state.clients);
			const globalObjects = await client.entryPoint.getContainerObjects();
			const entry = state.random.pick(
				globalObjects.filter((v) => v.type === "stressDataObject"),
			);
			assert(entry?.type === "stressDataObject");
			const datastore = entry.stressDataObject;
			const channels = await datastore.StressDataObject.getChannels();
			const channel = state.random.pick(channels);
			assert(channel !== undefined, "channel must exist");
			const baseOp = await runInStateWithClient(state, client, datastore, channel, async () =>
				baseGenerator(state),
			);
			return baseOp === done
				? done
				: ({
						...baseOp,
						clientTag: client.tag,
						datastoreTag: entry.tag,
						channelTag: channel.id as `channel-${number}`,
					} satisfies SelectedClientSpec);
		};
	};

	const reducer: AsyncReducer<TOperation | Synchronize, LocalServerStressState> = async (
		state,
		operation,
	) => {
		assert(hasSelectedClientSpec(operation), "operation should have been given a client");
		const client = state.clients.find((c) => c.tag === operation.clientTag);
		assert(client !== undefined);
		const globalObjects = await client.entryPoint.getContainerObjects();
		const entry = globalObjects.find((e) => e.tag === operation.datastoreTag);
		assert(entry?.type === "stressDataObject");
		const datastore = entry.stressDataObject;
		const channels = await datastore.StressDataObject.getChannels();
		const channel = channels.find((c) => c.id === operation.channelTag);
		assert(channel !== undefined, "channel must exist");
		await runInStateWithClient(state, client, datastore, channel, async () => {
			await model.reducer(state, operation as TOperation);
		});
	};
	return {
		...model,
		generatorFactory,
		reducer,
	};
}

/**
 * This modifies the value of "client" while callback is running, then restores it.
 * This is does instead of copying the state since the state object is mutable, and running callback might make changes to state (like add new members) which are lost if state is just copied.
 *
 * Since the callback is async, this modification to the state could be an issue if multiple runs of this function are done concurrently.
 */
async function runInStateWithClient<Result>(
	state: LocalServerStressState,
	client: LocalServerStressState["client"],
	datastore: LocalServerStressState["datastore"],
	channel: LocalServerStressState["channel"],
	callback: (state: LocalServerStressState) => Promise<Result>,
): Promise<Result> {
	const old = { ...state };
	state.client = client;
	state.datastore = datastore;
	state.channel = channel;
	try {
		return await callback(state);
	} finally {
		// This code is explicitly trying to "update" to the old value.

		state.client = old.client;
		state.datastore = old.datastore;
		state.channel = old.channel;
	}
}

function createStressLogger(seed: number) {
	const logger = getTestLogger?.();
	return createChildLogger({ logger, properties: { all: { seed } } });
}

async function createDetachedClient(
	localDeltaConnectionServer: ILocalDeltaConnectionServer,
	codeLoader: ICodeDetailsLoader,
	codeDetails: IFluidCodeDetails,
	tag: `client-${number}`,
	seed: number,
): Promise<Client> {
	const container = await createDetachedContainer({
		codeLoader,
		documentServiceFactory: new LocalDocumentServiceFactory(localDeltaConnectionServer),
		urlResolver: new LocalResolver(),
		codeDetails,
		logger: createStressLogger(seed),
	});

	const maybe: FluidObject<DefaultStressDataObject> | undefined =
		await container.getEntryPoint();
	assert(maybe.DefaultStressDataObject !== undefined, "must be DefaultStressDataObject");

	const newClient: Client = {
		container,
		tag,
		entryPoint: maybe.DefaultStressDataObject,
	};
	return newClient;
}

async function loadClient(
	localDeltaConnectionServer: ILocalDeltaConnectionServer,
	codeLoader: ICodeDetailsLoader,
	tag: `client-${number}`,
	url: string,
	seed: number,
): Promise<Client> {
	const container = await loadExistingContainer({
		documentServiceFactory: new LocalDocumentServiceFactory(localDeltaConnectionServer),
		request: { url },
		urlResolver: new LocalResolver(),
		codeLoader,
		logger: createStressLogger(seed),
	});

	const maybe: FluidObject<DefaultStressDataObject> | undefined =
		await container.getEntryPoint();
	assert(maybe.DefaultStressDataObject !== undefined, "must be DefaultStressDataObject");

	return {
		container,
		tag,
		entryPoint: maybe.DefaultStressDataObject,
	};
}
/**
 * Runs the provided DDS fuzz model. All functionality is already assumed to be mixed in.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
async function runTestForSeed<TOperation extends BaseOperation>(
	model: LocalServerStressModel<TOperation>,
	options: Omit<LocalServerStressOptions, "only" | "skip">,
	seed: number,
	saveInfo?: SaveInfo,
): Promise<void> {
	const random = makeRandom(seed);

	const localDeltaConnectionServer = LocalDeltaConnectionServer.create();
	const codeDetails: IFluidCodeDetails = {
		package: "local-server-stress-tests",
	};
	const codeLoader = new LocalCodeLoader([[codeDetails, createRuntimeFactory()]]);
	const tagCount: Partial<Record<string, number>> = {};
	// we reserve prefix-0 for initialization objects
	const tag: LocalServerStressState["tag"] = (prefix) =>
		`${prefix}-${(tagCount[prefix] = (tagCount[prefix] ??= 0) + 1)}`;

	const detachedClient = await createDetachedClient(
		localDeltaConnectionServer,
		codeLoader,
		codeDetails,
		// we use tagging here, and not zero, as we will create client 0 after attach.
		tag("client"),
		seed,
	);

	const initialState: LocalServerStressState = {
		clients: [detachedClient],
		localDeltaConnectionServer,
		codeLoader,
		random,
		validationClient: detachedClient,
		client: makeUnreachableCodePathProxy("client"),
		datastore: makeUnreachableCodePathProxy("datastore"),
		channel: makeUnreachableCodePathProxy("channel"),
		isDetached: true,
		seed,
		tag,
	};

	let operationCount = 0;
	const generator = model.generatorFactory();
	const finalState = await performFuzzActionsAsync(
		generator,
		async (state, operation) => {
			operationCount++;
			return model.reducer(state, operation);
		},
		initialState,
		saveInfo,
	);

	// Sanity-check that the generator produced at least one operation. If it failed to do so,
	// this usually indicates an error on the part of the test author.
	assert(operationCount > 0, "Generator should have produced at least one operation.");

	const { clients, validationClient } = finalState;
	for (const client of clients) {
		client.container.connect();
		await model.validateConsistency(client, validationClient);
		client.container.dispose();
	}

	validationClient.container.dispose();
}

function runTest<TOperation extends BaseOperation>(
	model: LocalServerStressModel<TOperation>,
	options: InternalOptions,
	seed: number,
	saveInfo: SaveInfo | undefined,
): void {
	const itFn = options.only.has(seed) ? it.only : options.skip.has(seed) ? it.skip : it;
	itFn(`workload: ${model.workloadName} seed: ${seed}`, async function () {
		const inCi = process.env.TF_BUILD !== undefined;
		const shouldMinimize: boolean =
			options.skipMinimization !== true &&
			saveInfo !== undefined &&
			saveInfo.saveOnFailure !== false &&
			!inCi;

		// 10 seconds per test should be quite a bit more than is necessary, but
		// a timeout during minimization can cause bad UX because it obfuscates
		// the actual error
		//
		// it should be noted that if a timeout occurs during minimization, the
		// intermediate results are not lost and will still be written to the file.
		const noMinimizationTimeout = this.timeout() === 0 ? 0 : Math.max(2000, this.timeout());
		this.timeout(shouldMinimize ? 5 * noMinimizationTimeout : noMinimizationTimeout);

		try {
			// don't write to files in CI
			await runTestForSeed(model, options, seed, inCi ? undefined : saveInfo);
		} catch (error) {
			if (!shouldMinimize || saveInfo === undefined) {
				throw error;
			}
			const savePath: string = (saveInfo?.saveOnFailure as SaveDestination).path;
			let file: Buffer;
			try {
				file = readFileSync(savePath);
			} catch {
				// File could not be read and likely does not exist.
				// Test may have failed outside of the fuzz test portion (on setup or teardown).
				// Throw original error that made test fail.
				throw error;
			}
			const operations = JSON.parse(file.toString()) as TOperation[];
			const minimizer = new FuzzTestMinimizer<TOperation>(
				model.minimizationTransforms,
				operations,
				saveInfo,
				async (generator) => replayTest<TOperation>(model, seed, generator, saveInfo, options),
				3,
			);

			const minimized = await minimizer.minimize();
			await saveOpsToFile(savePath, minimized);

			throw error;
		}
	});
}

type InternalOptions = Omit<LocalServerStressOptions, "only" | "skip"> & {
	only: Set<number>;
	skip: Set<number>;
};

function isInternalOptions(options: LocalServerStressOptions): options is InternalOptions {
	return options.only instanceof Set && options.skip instanceof Set;
}

/**
 * Performs the test again to verify if the DDS still fails with the same error message.
 *
 * @internal
 */
export async function replayTest<TOperation extends BaseOperation>(
	ddsModel: LocalServerStressModel<TOperation>,
	seed: number,
	generator: AsyncGenerator<TOperation, unknown>,
	saveInfo?: SaveInfo,
	providedOptions?: Partial<LocalServerStressOptions>,
): Promise<void> {
	const options = {
		...defaultLocalServerStressSuiteOptions,
		...providedOptions,
		only: new Set(providedOptions?.only ?? []),
		skip: new Set(providedOptions?.skip ?? []),
	};

	const _model = getFullModel(ddsModel, options);

	const model = {
		..._model,
		// We lose some type safety here because the options interface isn't generic
		generatorFactory: () => generator,
	};

	await runTestForSeed(model, options, seed, saveInfo);
}

/**
 * Creates a suite of eventual consistency tests for a particular DDS model.
 * @internal
 */
export function createLocalServerStressSuite<TOperation extends BaseOperation>(
	ddsModel: LocalServerStressModel<TOperation>,
	providedOptions?: Partial<LocalServerStressOptions>,
): void {
	const options = {
		...defaultLocalServerStressSuiteOptions,
		...providedOptions,
	};

	const only = new Set(options.only);
	const skip = new Set(options.skip);
	Object.assign(options, { only, skip });
	assert(isInternalOptions(options));

	const model = getFullModel(ddsModel, options);

	const describeFuzz = createFuzzDescribe({ defaultTestCount: options.defaultTestCount });
	describeFuzz(model.workloadName, ({ testCount, stressMode }) => {
		before(() => {
			if (options.saveFailures !== undefined) {
				mkdirSync(getSaveDirectory(options.saveFailures.directory, model), {
					recursive: true,
				});
			}
			if (options.saveSuccesses !== undefined) {
				mkdirSync(getSaveDirectory(options.saveSuccesses.directory, model), {
					recursive: true,
				});
			}
		});

		const seeds = generateTestSeeds(testCount, stressMode);
		for (const seed of seeds) {
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
					generatorFactory: (): AsyncGenerator<TOperation, unknown> =>
						asyncGeneratorFromArray(operations as TOperation[]),
				};
				runTest(replayModel, options, seed, undefined);
			});
		}
	});
}

/**
 * @internal
 */
export interface ChangeConnectionState {
	type: "changeConnectionState";
	connected: boolean;
}

/**
 * Mixes in functionality to disconnect and reconnect clients in a DDS fuzz model.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export function mixinReconnect<TOperation extends BaseOperation>(
	model: LocalServerStressModel<TOperation>,
	options: LocalServerStressOptions,
): LocalServerStressModel<TOperation | ChangeConnectionState> {
	const generatorFactory: () => AsyncGenerator<
		TOperation | ChangeConnectionState,
		LocalServerStressState
	> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | ChangeConnectionState | typeof done> => {
			if (!state.isDetached && state.random.bool(options.reconnectProbability)) {
				const client = state.clients.find((c) => c.tag === state.client.tag);
				assert(client !== undefined);
				return {
					type: "changeConnectionState",
					connected: client.container.connectionState === ConnectionState.Connected,
				};
			}

			return baseGenerator(state);
		};
	};

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | ChangeConnectionState>[]
		| undefined;

	const reducer: AsyncReducer<
		TOperation | ChangeConnectionState,
		LocalServerStressState
	> = async (state, operation) => {
		if (isOperationType<ChangeConnectionState>("changeConnectionState", operation)) {
			if (operation.connected) {
				state.client.container.disconnect();
			} else {
				state.client.container.connect();
			}
			return state;
		} else {
			return model.reducer(state, operation);
		}
	};
	return {
		...model,
		minimizationTransforms,
		generatorFactory,
		reducer,
	};
}

const getFullModel = <TOperation extends BaseOperation>(
	ddsModel: LocalServerStressModel<TOperation>,
	options: LocalServerStressOptions,
): LocalServerStressModel<
	TOperation | AddClient | RemoveClient | Attach | Synchronize | ChangeConnectionState
> =>
	mixinAttach(
		mixinSynchronization(
			mixinAddRemoveClient(
				mixinClientSelection(mixinReconnect(ddsModel, options), options),
				options,
			),
			options,
		),
		options,
	);

/**
 * {@inheritDoc (createLocalServerStressSuite:function)}
 * @internal
 */
// Explicit usage of namespace needed for api-extractor.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace createLocalServerStressSuite {
	/**
	 * Runs only the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Runs only seed 42 for the given model.
	 * createLocalServerStressSuite.only(42)(model);
	 * ```
	 * @internal
	 */
	export const only =
		(...seeds: number[]) =>
		<TOperation extends BaseOperation>(
			ddsModel: LocalServerStressModel<TOperation>,
			providedOptions?: Partial<LocalServerStressOptions>,
		): void =>
			createLocalServerStressSuite(ddsModel, {
				...providedOptions,
				only: [...seeds, ...(providedOptions?.only ?? [])],
			});

	/**
	 * Skips the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Skips seed 42 for the given model.
	 * createLocalServerStressSuite.skip(42)(model);
	 * ```
	 * @internal
	 */
	export const skip =
		(...seeds: number[]) =>
		<TOperation extends BaseOperation>(
			ddsModel: LocalServerStressModel<TOperation>,
			providedOptions?: Partial<LocalServerStressOptions>,
		): void =>
			createLocalServerStressSuite(ddsModel, {
				...providedOptions,
				skip: [...seeds, ...(providedOptions?.skip ?? [])],
			});
}
