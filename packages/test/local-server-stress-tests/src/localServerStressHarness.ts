/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	AsyncGenerator,
	AsyncReducer,
	BaseFuzzTestState,
	IRandom,
	SaveDestination,
	SaveInfo,
} from "@fluid-private/stochastic-test-utils";
import {
	ExitBehavior,
	StressMode,
	asyncGeneratorFromArray,
	chainAsync,
	createFuzzDescribe,
	defaultOptions,
	done,
	interleaveAsync,
	makeRandom,
	performFuzzActionsAsync,
	saveOpsToFile,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { MinimizationTransform } from "./minification.js";
import { FuzzTestMinimizer } from "./minification.js";

import {
	createLocalResolverCreateNewRequest,
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import type {
	ICodeDetailsLoader,
	IContainer,
	IFluidCodeDetails,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	ConnectionState,
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { LocalCodeLoader } from "@fluidframework/test-utils/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";

const isOperationType = <O extends BaseOperation>(
	type: O["type"],
	op: BaseOperation,
): op is O => op.type === type;

/**
 * @internal
 */
export interface DDSRandom extends IRandom {
	handle(): IFluidHandle;
}

export interface Client {
	container: IContainer;
	id: string;
}

/**
 * @internal
 */
export interface DDSFuzzTestState extends BaseFuzzTestState {
	localDeltaConnectionServer: ILocalDeltaConnectionServer;
	codeLoader: ICodeDetailsLoader;
	containerUrl?: string;

	random: IRandom;

	clients: Client[];
	client: Client;
	isDetached: boolean;
}

/**
 * @internal
 */
export interface ClientSpec {
	clientId: string;
}

/**
 * @internal
 */
export interface BaseOperation {
	type: number | string;
}

/**
 * @internal
 */
export interface Attach {
	type: "attach";
}

/**
 * @internal
 */
export interface AddClient {
	type: "addClient";
	id: string;
	url: string;
}

/**
 * @internal
 */
export interface Synchronize {
	type: "synchronize";
	clients?: Client[];
}

/**
 * @internal
 */
interface HasWorkloadName {
	workloadName: string;
}

function getSaveDirectory(directory: string, model: HasWorkloadName): string {
	const workloadFriendly = model.workloadName.replace(/[\s_]+/g, "-").toLowerCase();
	return path.join(directory, workloadFriendly);
}

function getSavePath(directory: string, model: HasWorkloadName, seed: number): string {
	return path.join(getSaveDirectory(directory, model), `${seed}.json`);
}

function getSaveInfo(
	model: HasWorkloadName,
	options: DDSFuzzSuiteOptions,
	seed: number,
): SaveInfo {
	return {
		saveOnFailure: options.saveFailures
			? { path: getSavePath(options.saveFailures.directory, model, seed) }
			: false,
		saveOnSuccess: options.saveSuccesses
			? { path: getSavePath(options.saveSuccesses.directory, model, seed) }
			: false,
	};
}

/**
 * Represents a generic fuzz model for testing eventual consistency of a DDS.
 *
 * @remarks
 *
 * Typical DDSes will parameterize this with their SharedObject factory and a serializable set
 * of operations corresponding to valid edits in the DDS's public API.
 *
 * @example
 * A simplified SharedString data structure exposing the APIs `insertAt(index, contentString)` and `removeRange(start, end)`
 * might represent their API with the following operations:
 * ```typescript
 * type InsertOperation = { type: "insert"; index: number; content: string }
 * type RemoveOperation = { type: "remove"; start: number; end: number }
 * type Operation = InsertOperation | RemoveOperation;
 * ```
 *
 * It would then typically use utilities from \@fluid-private/stochastic-test-utils to write a generator
 * for inserting/removing content, and a reducer for interpreting the serializable operations in terms of
 * SimpleSharedString's public API.
 *
 * See \@fluid-private/stochastic-test-utils's README for more details on this step.
 *
 * Then, it could define a model like so:
 * ```typescript
 * const model: DDSFuzzModel<SimpleSharedStringFactory, Operation> = {
 *     workloadName: "insert and delete",
 *     factory: SimpleSharedStringFactory,
 *     generatorFactory: myGeneratorFactory,
 *     reducer: myReducer,
 *     // A non-toy implementation would typically give a more informative assertion error (e.g. including
 *     // the IDs for `a` and `b`).
 *     validateConsistency: (a, b) => { assert.equal(a.channel.getText(), b.channel.getText()); }
 * }
 * ```
 * This model can be used directly to create a suite of fuzz tests with {@link (createDDSFuzzSuite:function)}
 *
 * @internal
 */
export interface DDSFuzzModel<
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState = DDSFuzzTestState,
> {
	/**
	 * Name for this model. This is used for test case naming, and should generally reflect properties
	 * about the kinds of operations that are generated.
	 * For example, SharedString might fuzz test several different workloads--some involving intervals,
	 * some without, some that never delete text, etc.
	 * This name should also be relatively friendly for file system; if the "save to disk" option of
	 * {@link (createDDSFuzzSuite:function)} is enabled, it will be kebab cased for failure files.
	 */
	workloadName: string;

	/**
	 * Factory which creates a generator for this model.
	 * @remarks DDS model generators can decide to use the "channel" or "client" field to decide which
	 * client to perform the operation on.
	 */
	generatorFactory: () => AsyncGenerator<TOperation, TState>;

	/**
	 * Reducer capable of updating the test state according to the operations generated.
	 */
	reducer: AsyncReducer<TOperation, TState>;

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
export interface DDSFuzzHarnessEvents {
	/**
	 * Raised for each non-summarizer client created during fuzz test execution.
	 */
	(event: "clientCreate", listener: (client: Client) => void);

	/**
	 * Raised after creating the initialState but prior to performing the fuzzActions..
	 */
	(event: "testStart", listener: (initialState: DDSFuzzTestState) => void);

	/**
	 * Raised after all fuzzActions have been completed.
	 */
	(event: "testEnd", listener: (finalState: DDSFuzzTestState) => void);

	/**
	 * Raised before each generated operation is run by its reducer.
	 */
	(event: "operationStart", listener: (operation: BaseOperation) => void);
}

/**
 * @internal
 */
export interface DDSFuzzSuiteOptions {
	/**
	 * Number of tests to generate for correctness modes (which are run in the PR gate).
	 */
	defaultTestCount: number;

	/**
	 * Number of clients to perform operations on following the attach phase.
	 * This does not include the read-only client created for consistency validation
	 * and summarization--see {@link DDSFuzzTestState.summarizerClient}.
	 *
	 * See {@link DDSFuzzSuiteOptions.detachedStartOptions} for more details on the detached start phase.
	 * See {@link DDSFuzzSuiteOptions.clientJoinOptions} for more details on clients joining after those in the initial attach.
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
	clientJoinOptions?: {
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
		/**
		 * The probability for an added client to also be stashable which simulates
		 * getting the pending state, closing the container, and re-opening with the state.
		 */
		stashableClientProbability?: number;
	};

	/**
	 * Dictates simulation of edits made to a DDS while that DDS is detached.
	 *
	 * When enabled, the fuzz test starts with a single client generating edits. After a certain number of ops (dictated by `numOpsBeforeAttach`),
	 * an attach op will be generated, at which point:
	 * - getAttachSummary will be invoked on this client
	 * - The remaining clients (as dictated by {@link DDSFuzzSuiteOptions.numberOfClients}) will load from this summary and join the session
	 *
	 * This setup simulates application code initializing state in a data store before attaching it, e.g. running code to edit a DDS from
	 * `DataObject.initializingFirstTime`.
	 * Default: tests are run with this setting enabled, with 5 ops being generated before an attach op. A new client is also rehydrated from
	 * summary. To disable the generation of rehydrate ops, set `rehydrateDisabled` to `true`.
	 */
	detachedStartOptions: {
		numOpsBeforeAttach: number;
		rehydrateDisabled?: true;
		attachingBeforeRehydrateDisable?: true;
	};

	/**
	 * Defines whether or not ops can be submitted with handles.
	 */
	handleGenerationDisabled: boolean;

	/**
	 * Event emitter which allows hooking into interesting points of DDS harness execution.
	 * Test authors that want to subscribe to any of these events should create a `TypedEventEmitter`,
	 * do so, and pass it in when creating the suite.
	 *
	 * @example
	 *
	 * ```typescript
	 * const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
	 * emitter.on("clientCreate", (client) => {
	 *     // Casting is necessary as the event typing isn't parameterized with each DDS type.
	 *     const myDDS = client.channel as MyDDSType;
	 *     // Do what you want with `myDDS`, e.g. subscribe to change events, add logging, etc.
	 * });
	 * const options = {
	 *     ...defaultDDSFuzzSuiteOptions,
	 *     emitter,
	 * };
	 * createDDSFuzzSuite(model, options);
	 * ```
	 */
	emitter: TypedEventEmitter<DDSFuzzHarnessEvents>;

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
	 * Each non-synchronization option has this probability of rebasing the current batch before sending it.
	 */
	rebaseProbability: number;

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
	 * createDDSFuzzSuite(model, { only: [42] });
	 * ```
	 *
	 * @remarks
	 * If you prefer, a variant of the standard `.only` syntax works. See {@link (createDDSFuzzSuite:namespace).only}.
	 */
	only: Iterable<number>;

	/**
	 * Skips the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Skips seed 42 for the given model.
	 * createDDSFuzzSuite(model, { skip: [42] });
	 * ```
	 *
	 * @remarks
	 * If you prefer, a variant of the standard `.skip` syntax works. See {@link (createDDSFuzzSuite:namespace).skip}.
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
	 * Whether successful runs should be saved to disk and where.
	 * Minimization will be skipped for these files.
	 *
	 * This feature is useful to audit the scenarios generated by a given fuzz configuration.
	 */
	saveSuccesses: false | { directory: string };

	/**
	 * Whether or not to skip minimization of fuzz failing test cases. This is useful
	 * when one only cares about the counts or types of errors, and not the
	 * exact contents of the test cases.
	 *
	 * Minimization only works when the failure occurs as part of a reducer, and is mostly
	 * useful if the model being tested defines {@link DDSFuzzModel.minimizationTransforms}.
	 *
	 * It can also add a couple seconds of overhead per failing
	 * test case. See {@link MinimizationTransform} for additional context.
	 */
	skipMinimization?: boolean;
}

/**
 * @internal
 */
export const defaultDDSFuzzSuiteOptions: DDSFuzzSuiteOptions = {
	defaultTestCount: defaultOptions.defaultTestCount,
	detachedStartOptions: {
		numOpsBeforeAttach: 5,
	},
	handleGenerationDisabled: true,
	emitter: new TypedEventEmitter(),
	numberOfClients: 3,
	only: [],
	skip: [],
	parseOperations: (serialized: string) => JSON.parse(serialized) as BaseOperation[],
	reconnectProbability: 0,
	rebaseProbability: 0,
	saveFailures: false,
	saveSuccesses: false,
	validationStrategy: { type: "random", probability: 0.05 },
};

/**
 * Mixes in functionality to add new clients to a DDS fuzz model.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export function mixinNewClient<
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState,
>(
	model: DDSFuzzModel<TOperation, TState>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzModel<TOperation | AddClient, TState> {
	const isClientAddOp = (op: TOperation | AddClient): op is AddClient =>
		op.type === "addClient";

	const generatorFactory: () => AsyncGenerator<TOperation | AddClient, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state: TState): Promise<TOperation | AddClient | typeof done> => {
			const baseOp = baseGenerator(state);
			const { clients, random, isDetached, containerUrl } = state;
			if (
				containerUrl !== undefined &&
				options.clientJoinOptions !== undefined &&
				clients.length < options.clientJoinOptions.maxNumberOfClients &&
				!isDetached &&
				random.bool(options.clientJoinOptions.clientAddProbability)
			) {
				return {
					type: "addClient",
					url: containerUrl,
					id: makeFriendlyClientId(random, clients.length),
				} satisfies AddClient;
			}
			return baseOp;
		};
	};

	const minimizationTransforms: MinimizationTransform<TOperation | AddClient>[] =
		(model.minimizationTransforms as
			| MinimizationTransform<TOperation | AddClient>[]
			| undefined) ?? [];

	const reducer: AsyncReducer<TOperation | AddClient, TState> = async (state, op) => {
		if (isClientAddOp(op)) {
			const newClient = await loadClient(
				state.localDeltaConnectionServer,
				state.codeLoader,
				op.id,
				op.url,
			);
			state.clients.push(newClient);
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
export function mixinAttach<TOperation extends BaseOperation, TState extends DDSFuzzTestState>(
	model: DDSFuzzModel<TOperation, TState>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzModel<TOperation | Attach, TState> {
	const { numOpsBeforeAttach } = options.detachedStartOptions;
	if (numOpsBeforeAttach === 0) {
		// not wrapping the reducer/generator in this case makes stepping through the harness slightly less painful.
		return model as DDSFuzzModel<TOperation | Attach, TState>;
	}
	const attachOp = async (): Promise<TOperation | Attach> => {
		return { type: "attach" };
	};

	const generatorFactory: () => AsyncGenerator<TOperation | Attach, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return chainAsync(
			takeAsync(numOpsBeforeAttach, baseGenerator),
			takeAsync(1, attachOp),
			baseGenerator,
		);
	};

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | Attach>[]
		| undefined;

	const reducer: AsyncReducer<TOperation | Attach, TState> = async (state, operation) => {
		if (isOperationType<Attach>("attach", operation)) {
			state.isDetached = false;
			assert.equal(state.clients.length, 1);
			const clientA: Client = state.clients[0];

			await clientA.container.attach(createLocalResolverCreateNewRequest("stress test"));
			const url = await clientA.container.getAbsoluteUrl("");
			assert(url !== undefined, "container must have a url");
			const clients: Client[] = await Promise.all(
				Array.from({ length: options.numberOfClients }, async (_, index) =>
					loadClient(
						state.localDeltaConnectionServer,
						state.codeLoader,
						url,
						makeFriendlyClientId(state.random, index),
					),
				),
			);

			// While detached, the initial state was set up so that the 'summarizer client' was the same as the detached client.
			// This is actually a pretty reasonable representation of what really happens.
			// However, now that we're transitioning to an attached state, the summarizer client should never have any edits.
			// Thus we use one of the clients we just loaded as the summarizer client, and keep the client around that we generated the
			// attach summary from.
			const summarizerClient: Client = clients[0];
			clients[0] = state.clients[0];

			return {
				...state,
				isDetached: false,
				clients,
				summarizerClient,
			};
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
export function mixinSynchronization<
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState,
>(
	model: DDSFuzzModel<TOperation, TState>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzModel<TOperation | Synchronize, TState> {
	const { validationStrategy } = options;
	let generatorFactory: () => AsyncGenerator<TOperation | Synchronize, TState>;

	switch (validationStrategy.type) {
		case "random": {
			// passing 1 here causes infinite loops. passing close to 1 is wasteful
			// as synchronization + eventual consistency validation should be idempotent.
			// 0.5 is arbitrary but there's no reason anyone should want a probability near this.
			assert(validationStrategy.probability < 0.5, "Use a lower synchronization probability.");
			generatorFactory = (): AsyncGenerator<TOperation | Synchronize, TState> => {
				const baseGenerator = model.generatorFactory();
				return async (state: TState): Promise<TOperation | Synchronize | typeof done> =>
					!state.isDetached && state.random.bool(validationStrategy.probability)
						? { type: "synchronize" }
						: baseGenerator(state);
			};
			break;
		}

		case "fixedInterval": {
			generatorFactory = (): AsyncGenerator<TOperation | Synchronize, TState> => {
				const baseGenerator = model.generatorFactory();
				return interleaveAsync<TOperation | Synchronize, TState>(
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
			generatorFactory = (): AsyncGenerator<TOperation | Synchronize, TState> => {
				const baseGenerator = model.generatorFactory();
				return async (state: TState): Promise<TOperation | Synchronize | typeof done> => {
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
	const reducer: AsyncReducer<TOperation | Synchronize, TState> = async (state, operation) => {
		// TODO: Only synchronize listed clients if specified
		if (isSynchronizeOp(operation)) {
			const connectedClients = state.clients.filter(
				(client) => client.container.connectionState === ConnectionState.Connected,
			);

			await Promise.all(
				connectedClients.map(
					(c) =>
						new Promise<void>((resolve) =>
							c.container.isDirty ? c.container.once("saved", () => resolve()) : resolve(),
						),
				),
			);

			if (connectedClients.length > 0) {
				const readonlyChannel = state.clients[0];
				for (const client of connectedClients) {
					try {
						await model.validateConsistency(readonlyChannel, client);
					} catch (error: unknown) {
						if (error instanceof Error) {
							error.message = `Comparing client ${readonlyChannel.container.clientId} vs client ${client.container.clientId}\n${error.message}`;
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

const isClientSpec = (op: unknown): op is ClientSpec =>
	(op as ClientSpec).clientId !== undefined;

/**
 * Mixes in the ability to select a client to perform an operation on.
 * Makes this available to existing generators and reducers in the passed-in model via {@link DDSFuzzTestState.client}
 * and {@link  @fluid-private/test-dds-utils#DDSFuzzTestState.channel}.
 *
 * @remarks This exists purely for convenience, as "pick a client to perform an operation on" is a common concern.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export function mixinClientSelection<
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState,
>(
	model: DDSFuzzModel<TOperation, TState>,
	_: DDSFuzzSuiteOptions,
): DDSFuzzModel<TOperation, TState> {
	const generatorFactory: () => AsyncGenerator<TOperation, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | typeof done> => {
			// Pick a channel, and:
			// 1. Make it available for the DDS model generators (so they don't need to
			// do the boilerplate of selecting a client to perform the operation on)
			// 2. Make it available to the subsequent reducer logic we're going to inject
			// (so that we can recover the channel from serialized data)
			const client = state.random.pick(state.clients);
			const baseOp = await runInStateWithClient(state, client, async () =>
				baseGenerator(state),
			);
			return baseOp === done
				? done
				: {
						...baseOp,
						clientId: client.id,
					};
		};
	};

	const reducer: AsyncReducer<TOperation | Synchronize, TState> = async (state, operation) => {
		assert(isClientSpec(operation), "operation should have been given a client");
		const client = state.clients.find((c) => c.id === operation.clientId);
		assert(client !== undefined);
		await runInStateWithClient(state, client, async () =>
			model.reducer(state, operation as TOperation),
		);
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
async function runInStateWithClient<TState extends DDSFuzzTestState, Result>(
	state: TState,
	client: TState["client"],
	callback: (state: TState) => Promise<Result>,
): Promise<Result> {
	const oldClient = state.client;
	state.client = client;
	try {
		return await callback(state);
	} finally {
		// This code is explicitly trying to "update" to the old value.
		// eslint-disable-next-line require-atomic-updates
		state.client = oldClient;
	}
}

function makeUnreachableCodePathProxy<T extends object>(name: string): T {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return new Proxy({} as T, {
		get: (): never => {
			throw new Error(
				`Unexpected read of '${name}:' this indicates a bug in the DDS eventual consistency harness.`,
			);
		},
	});
}

async function createDetachedClient(
	localDeltaConnectionServer: ILocalDeltaConnectionServer,
	codeLoader: ICodeDetailsLoader,
	codeDetails: IFluidCodeDetails,
	id: string,
): Promise<Client> {
	const container = await createDetachedContainer({
		codeLoader,
		documentServiceFactory: new LocalDocumentServiceFactory(localDeltaConnectionServer),
		urlResolver: new LocalResolver(),
		codeDetails,
	});

	const newClient: Client = {
		container,
		id,
	};
	return newClient;
}

async function loadClient(
	localDeltaConnectionServer: ILocalDeltaConnectionServer,
	codeLoader: ICodeDetailsLoader,
	id: string,
	url: string,
): Promise<Client> {
	const container = await loadExistingContainer({
		documentServiceFactory: new LocalDocumentServiceFactory(localDeltaConnectionServer),
		request: { url },
		urlResolver: new LocalResolver(),
		codeLoader,
	});

	return {
		container,
		id,
	};
}

/**
 * Gets a friendly ID for a client based on its index in the client list.
 * This exists purely for easier debugging--reasoning about client "A" is easier than reasoning
 * about client "3e8a621a-7b35-414b-897f-8795962fb415".
 */
function makeFriendlyClientId(random: IRandom, index: number): string {
	return index < 26 ? String.fromCodePoint(index + 65) : random.uuid4();
}

class StressDataObject extends DataObject {
	get StressDataObject() {
		return this;
	}
}

const stressDataObjectFactory = new DataObjectFactory(
	"ParentDataObject",
	StressDataObject,
	undefined,
	{},
);

const runtimeFactory: IRuntimeFactory = {
	get IRuntimeFactory() {
		return this;
	},
	instantiateRuntime: async (context, existing) => {
		return loadContainerRuntime({
			context,
			existing,
			registryEntries: [
				[stressDataObjectFactory.type, Promise.resolve(stressDataObjectFactory)],
			],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(stressDataObjectFactory.type);
					await ds.trySetAlias("default");
				}
				const root = await rt.getAliasedDataStoreEntryPoint("default");
				assert(root !== undefined, "default must exist");
				return root.get();
			},
		});
	},
};

/**
 * Runs the provided DDS fuzz model. All functionality is already assumed to be mixed in.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export async function runTestForSeed<TOperation extends BaseOperation>(
	model: DDSFuzzModel<TOperation>,
	options: Omit<DDSFuzzSuiteOptions, "only" | "skip">,
	seed: number,
	saveInfo?: SaveInfo,
): Promise<DDSFuzzTestState> {
	const random = makeRandom(seed);

	const startDetached = options.detachedStartOptions.numOpsBeforeAttach !== 0;
	const localDeltaConnectionServer = LocalDeltaConnectionServer.create();
	const codeDetails: IFluidCodeDetails = {
		package: "local-server-stress-tests",
	};
	const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);
	const initialClient = await createDetachedClient(
		localDeltaConnectionServer,
		codeLoader,
		codeDetails,
		startDetached ? makeFriendlyClientId(random, 0) : "summarizer",
	);
	if (!startDetached) {
		await initialClient.container.attach(createLocalResolverCreateNewRequest("stress"));
	}
	const url = "aas";

	const clients = startDetached
		? [initialClient]
		: await Promise.all(
				Array.from({ length: options.numberOfClients }, async (_, i) =>
					loadClient(
						localDeltaConnectionServer,
						codeLoader,
						makeFriendlyClientId(random, i),
						url,
					),
				),
			);
	const initialState: DDSFuzzTestState = {
		clients,
		localDeltaConnectionServer,
		codeLoader,
		random,
		client: makeUnreachableCodePathProxy("client"),
		isDetached: startDetached,
	};

	options.emitter.emit("testStart", initialState);

	let operationCount = 0;
	const generator = model.generatorFactory();
	const finalState = await performFuzzActionsAsync(
		generator,
		model.reducer,
		initialState,
		saveInfo,
	);

	// Sanity-check that the generator produced at least one operation. If it failed to do so,
	// this usually indicates an error on the part of the test author.
	assert(operationCount > 0, "Generator should have produced at least one operation.");

	options.emitter.emit("testEnd", finalState);

	return finalState;
}

function runTest<TOperation extends BaseOperation>(
	model: DDSFuzzModel<TOperation>,
	options: InternalOptions,
	seed: number,
	saveInfo: SaveInfo | undefined,
): void {
	const itFn = options.only.has(seed) ? it.only : options.skip.has(seed) ? it.skip : it;
	itFn(`workload: ${model.workloadName} seed: ${seed}`, async function () {
		const inCi = !!process.env.TF_BUILD;
		const shouldMinimize =
			!options.skipMinimization && saveInfo && saveInfo.saveOnFailure !== false && !inCi;

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
			if (!shouldMinimize) {
				throw error;
			}
			const savePath: string = (saveInfo.saveOnFailure as SaveDestination).path;
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
			const minimizer = new FuzzTestMinimizer(model, options, operations, seed, saveInfo, 3);

			const minimized = await minimizer.minimize();
			await saveOpsToFile(savePath, minimized);

			throw error;
		}
	});
}

type InternalOptions = Omit<DDSFuzzSuiteOptions, "only" | "skip"> & {
	only: Set<number>;
	skip: Set<number>;
};

function isInternalOptions(options: DDSFuzzSuiteOptions): options is InternalOptions {
	return options.only instanceof Set && options.skip instanceof Set;
}

/**
 * Some reducers require preconditions be met which are validated by their generator.
 * The validation can be lost if the generator is not run.
 * The primary case where this happens is during minimization. If a reducer detects this
 * problem, they can throw this error type, and minimization will consider the current
 * test invalid, rather than continuing to test invalid scenarios.
 * @internal
 */
export class ReducerPreconditionError extends Error {}

/**
 * Performs the test again to verify if the DDS still fails with the same error message.
 *
 * @internal
 */
export async function replayTest<TOperation extends BaseOperation>(
	ddsModel: DDSFuzzModel<TOperation>,
	seed: number,
	operations: TOperation[],
	saveInfo?: SaveInfo,
	providedOptions?: Partial<DDSFuzzSuiteOptions>,
): Promise<void> {
	const options = {
		...defaultDDSFuzzSuiteOptions,
		...providedOptions,
		only: new Set(providedOptions?.only ?? []),
		skip: new Set(providedOptions?.skip ?? []),
	};

	const _model = getFullModel(ddsModel, options);

	const model = {
		..._model,
		// We lose some type safety here because the options interface isn't generic
		generatorFactory: (): AsyncGenerator<TOperation, unknown> =>
			asyncGeneratorFromArray(operations),
	};

	await runTestForSeed(model, options, seed, saveInfo);
}

export function generateTestSeeds(testCount: number, stressMode: StressMode): number[] {
	switch (stressMode) {
		case StressMode.Short:
		case StressMode.Normal: {
			// Deterministic, fixed seeds
			return Array.from({ length: testCount }, (_, i) => i);
		}

		case StressMode.Long: {
			// Non-deterministic, random seeds
			const random = makeRandom();
			const longModeFactor = 2;
			const initialSeed = random.integer(
				0,
				Number.MAX_SAFE_INTEGER - longModeFactor * testCount,
			);
			return Array.from({ length: testCount * longModeFactor }, (_, i) => initialSeed + i);
		}

		default: {
			throw new Error(`Unsupported stress mode: ${stressMode}`);
		}
	}
}

/**
 * Creates a suite of eventual consistency tests for a particular DDS model.
 * @internal
 */
export function createDDSFuzzSuite<TOperation extends BaseOperation>(
	ddsModel: DDSFuzzModel<TOperation>,
	providedOptions?: Partial<DDSFuzzSuiteOptions>,
): void {
	const options = {
		...defaultDDSFuzzSuiteOptions,
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
			if (options.saveFailures !== false) {
				mkdirSync(getSaveDirectory(options.saveFailures.directory, model), {
					recursive: true,
				});
			}
			if (options.saveSuccesses !== false) {
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

const getFullModel = <TOperation extends BaseOperation>(
	ddsModel: DDSFuzzModel<TOperation>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzModel<TOperation | AddClient | Attach | Synchronize> =>
	mixinAttach(
		mixinSynchronization(
			mixinNewClient(mixinClientSelection(ddsModel, options), options),
			options,
		),
		options,
	);

/**
 * {@inheritDoc (createDDSFuzzSuite:function)}
 * @internal
 */
// Explicit usage of namespace needed for api-extractor.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace createDDSFuzzSuite {
	/**
	 * Runs only the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Runs only seed 42 for the given model.
	 * createDDSFuzzSuite.only(42)(model);
	 * ```
	 * @internal
	 */
	export const only =
		(...seeds: number[]) =>
		<TOperation extends BaseOperation>(
			ddsModel: DDSFuzzModel<TOperation>,
			providedOptions?: Partial<DDSFuzzSuiteOptions>,
		): void =>
			createDDSFuzzSuite(ddsModel, {
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
	 * createDDSFuzzSuite.skip(42)(model);
	 * ```
	 * @internal
	 */
	export const skip =
		(...seeds: number[]) =>
		<TOperation extends BaseOperation>(
			ddsModel: DDSFuzzModel<TOperation>,
			providedOptions?: Partial<DDSFuzzSuiteOptions>,
		): void =>
			createDDSFuzzSuite(ddsModel, {
				...providedOptions,
				skip: [...seeds, ...(providedOptions?.skip ?? [])],
			});
}
