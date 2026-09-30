/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync } from "node:fs";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	AsyncGenerator,
	AsyncReducer,
	BaseFuzzTestState,
	BaseOperation,
	IRandom,
	MinimizationTransform,
	Reducer,
	SaveDestination,
	SaveInfo,
} from "@fluid-private/stochastic-test-utils";
import {
	ExitBehavior,
	FuzzTestMinimizer,
	asyncGeneratorFromArray,
	chainAsync,
	createFuzzDescribe,
	createWeightedAsyncGenerator,
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
import { AttachState } from "@fluidframework/container-definitions";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { JsonSerializable } from "@fluidframework/core-interfaces/internal";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	IChannel,
	IChannelFactory,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { toIdCompressorWithCore } from "@fluidframework/id-compressor/internal";
import {
	isISharedObjectHandle,
	type IFluidSerializer,
	type ISharedObjectHandle,
} from "@fluidframework/shared-object-base/internal";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import type { IMockContainerRuntimeOptions } from "@fluidframework/test-runtime-utils/internal";

import {
	type Client,
	type ClientLoadData,
	type ClientWithStashData,
	type FuzzSerializedIdCompressor,
	createLoadData,
	createLoadDataFromStashData,
	hasStashData,
} from "./clientLoading.js";
import { DDSFuzzHandle } from "./ddsFuzzHandle.js";
import { DDSFuzzSerializer } from "./fuzzSerializer.js";
import { makeUnreachableCodePathProxy, reconnectAndSquash } from "./utils.js";

/**
 * @internal
 */
export interface DDSRandom extends IRandom {
	handle(): IFluidHandle;
}

/**
 * @typeParam TClientConfiguration - Consumer-defined configuration available on each client.
 * @internal
 */
export interface DDSFuzzTestState<
	TChannelFactory extends IChannelFactory,
	TClientConfiguration = unknown,
> extends BaseFuzzTestState {
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;

	random: DDSRandom;

	/**
	 * Client which is responsible for summarizing. This client remains connected and read-only
	 * throughout the test.
	 *
	 * This client is also used for consistency validation, as eventual consistency bugs are
	 * typically easier to reason about when one client was readonly.
	 */
	summarizerClient: Client<TChannelFactory, TClientConfiguration>;
	clients: Client<TChannelFactory, TClientConfiguration>[];
	// Client which was selected to perform an operation on
	client: Client<TChannelFactory, TClientConfiguration>;
	isDetached: boolean;
}

/**
 * @internal
 */
export interface ClientSpec {
	clientId: string;
}

/**
 * Chooses and resolves the recorded configuration for each new client.
 * @typeParam TChannelFactory - Factory used to create or load the DDS.
 * @typeParam TClientConfiguration - Consumer-defined JSON-serializable configuration.
 * @internal
 */
export interface DDSFuzzClientConfiguration<
	TChannelFactory extends IChannelFactory,
	TClientConfiguration,
> {
	/**
	 * Generates a configuration once per new client, including the summarizer.
	 * This callback is not called during replay or when restoring an existing client.
	 * The result must round-trip through JSON without changing its value.
	 */
	generate: (
		random: IRandom,
		client: ClientSpec & { isSummarizer: boolean },
	) => TClientConfiguration & JsonSerializable<TClientConfiguration>;

	/**
	 * Resolves a recorded configuration to a factory.
	 * Do not mutate the configuration or make random choices in this callback.
	 */
	factory: (clientConfiguration: TClientConfiguration) => TChannelFactory;
}

/**
 * Describes a client constructed during initialization or attachment.
 * @typeParam TClientConfiguration - Consumer-defined JSON-serializable configuration.
 * @internal
 */
export interface ClientInitialization<TClientConfiguration = unknown> extends ClientSpec {
	clientConfiguration: TClientConfiguration;
	canBeStashed: boolean;
}

/**
 * Records the clients constructed before the workload starts.
 * Only generated when client configuration is enabled.
 * @typeParam TClientConfiguration - Consumer-defined JSON-serializable configuration.
 * @internal
 */
export interface Initialize<TClientConfiguration = unknown> {
	type: "initialize";
	initialClient: ClientInitialization<TClientConfiguration>;
	clients: ClientInitialization<TClientConfiguration>[];
}

/**
 * @internal
 */
export interface ChangeConnectionState {
	type: "changeConnectionState";
	connected: boolean;
	squash: boolean;
}

/**
 * @internal
 */
export interface StashClient {
	type: "stashClient";
	existingClientId: string;
	newClientId: string;
}

/**
 * @typeParam TClientConfiguration - Consumer-defined JSON-serializable configuration.
 * @internal
 */
export interface Attach<TClientConfiguration = unknown> {
	type: "attach";
	/**
	 * Clients loaded at attachment, including the new summarizer.
	 * Absent when client configuration is not enabled.
	 */
	clients?: ClientInitialization<TClientConfiguration>[];
}

/**
 * @internal
 */
export interface Attaching {
	type: "attaching";
	beforeRehydrate?: true;
}

/**
 * @internal
 */
export interface Rehydrate {
	type: "rehydrate";
}

/**
 * @internal
 */
export interface TriggerRebase {
	type: "rebase";
}

/**
 * @internal
 */
export interface Rollback {
	type: "applyThenRollback";
	ddsOp: BaseOperation;
}

/**
 * @typeParam TClientConfiguration - Consumer-defined JSON-serializable configuration.
 * @internal
 */
export interface AddClient<TClientConfiguration = unknown> {
	type: "addClient";
	addedClientId: string;
	canBeStashed: boolean;
	/**
	 * Configuration used to resolve this client's factory.
	 * Absent when client configuration is not enabled.
	 */
	clientConfiguration?: TClientConfiguration;
}

/**
 * @internal
 */
export interface Synchronize {
	type: "synchronize";
	clients?: string[];
}

export type HarnessOperation<TClientConfiguration = unknown> =
	| AddClient<TClientConfiguration>
	| Attach<TClientConfiguration>
	| Initialize<TClientConfiguration>
	| Attaching
	| Rehydrate
	| ChangeConnectionState
	| TriggerRebase
	| Synchronize
	| StashClient
	| Rollback;

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
 * @typeParam TClientConfiguration - Consumer-defined configuration.
 * Defaults to the configuration type of the clients in `TState`.
 * @internal
 */
export interface DDSFuzzModel<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory> = DDSFuzzTestState<TChannelFactory>,
	TClientConfiguration = Exclude<TState["client"]["clientConfiguration"], undefined>,
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
	 * ChannelFactory to instantiate the DDS.
	 */
	factory: TChannelFactory;

	/**
	 * Opts into per-client configuration and records each choice in the operation log.
	 * When specified, its factory callback is used instead of {@link DDSFuzzModel.factory}.
	 * Rehydration and stash restoration reuse the original client's configuration.
	 */
	clientConfiguration?: DDSFuzzClientConfiguration<TChannelFactory, TClientConfiguration>;

	/**
	 * Factory which creates a generator for this model.
	 * @remarks DDS model generators can decide to use the "channel" or "client" field to decide which
	 * client to perform the operation on.
	 */
	generatorFactory: () => AsyncGenerator<TOperation, TState>;

	/**
	 * Reducer capable of updating the test state according to the operations generated.
	 */
	reducer: Reducer<TOperation, TState>;

	/**
	 * Equivalence validation function, which should verify that the provided channels contain the same data.
	 * This is run at each synchronization point for all connected clients (as disconnected clients won't
	 * necessarily have the same set of ops applied).
	 * @throws An informative error if the channels don't have equivalent data.
	 */
	validateConsistency: (
		channelA: Client<TChannelFactory, TClientConfiguration>,
		channelB: Client<TChannelFactory, TClientConfiguration>,
	) => void | Promise<void>;

	/**
	 * An array of transforms used during fuzz test minimization to reduce test
	 * cases. See {@link @fluid-private/stochastic-test-utils#MinimizationTransform} for additional context.
	 *
	 * If no transforms are supplied, minimization will still occur, but the
	 * contents of the operations will remain unchanged.
	 */
	minimizationTransforms?: MinimizationTransform<TOperation>[];
}

/**
 * This model is used within the harness to wrap the provided {@link DDSFuzzModel}.
 *
 * This model's reducer differs from the {@link DDSFuzzModel} in that it can be an asynchronous
 * reducer. This is necessary for the harness to support asynchronous operations
 * like loading new clients, and doing synchronization.
 *
 * @typeParam TClientConfiguration - Consumer-defined configuration.
 * Defaults to the configuration type of the clients in `TState`.
 * @internal
 */
export interface DDSFuzzHarnessModel<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory> = DDSFuzzTestState<TChannelFactory>,
	TClientConfiguration = Exclude<TState["client"]["clientConfiguration"], undefined>,
> extends Omit<
		DDSFuzzModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
		"reducer"
	> {
	/**
	 * Reducer capable of updating the test state according to the operations generated.
	 */
	reducer: AsyncReducer<TOperation, TState> | Reducer<TOperation, TState>;
}

/**
 * @internal
 */
export interface DDSFuzzHarnessEvents {
	/**
	 * Raised for each non-summarizer client created during fuzz test execution.
	 */
	(event: "clientCreate", listener: (client: Client<IChannelFactory>) => void);

	/**
	 * Raised after creating the initialState but prior to performing the fuzzActions..
	 */
	(event: "testStart", listener: (initialState: DDSFuzzTestState<IChannelFactory>) => void);

	/**
	 * Raised after all fuzzActions have been completed.
	 */
	(event: "testEnd", listener: (finalState: DDSFuzzTestState<IChannelFactory>) => void);

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
		/**
		 * If true, disable rehydrating DDSes while they are in the "attaching" state.
		 *
		 * BEWARE: The harness has known correctness issues with rehydration when there are outstanding id compressor ops. DDSes that use id-compressor
		 * should set this to `true` if they test rehydration. AB#43127 has more context.
		 */
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
	 * Each generated DDS operation has this probability of being rolled back immediately after application.
	 */
	rollbackProbability: number;

	/**
	 * Seed which should be replayed from disk.
	 *
	 * This option is intended for quick, by-hand minimization of failure JSON. As such, it adds a `.only`
	 * to the corresponding replay test.
	 *
	 * TODO: Improving workflows around fuzz test minimization, regression test generation for a particular seed,
	 * or more flexibility around replay of test files would be a nice value add to this harness.
	 */
	replay?: number | Iterable<number>;

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
	only: Iterable<number> | number;

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
	skip: Iterable<number> | number;

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
	 * Options to be provided to the underlying container runtimes {@link @fluidframework/test-runtime-utils#IMockContainerRuntimeOptions}.
	 * By default nothing will be provided, which means that the runtimes will:
	 * - use FlushMode.Immediate, which means that all ops will be sent as soon as they are produced,
	 * therefore all batches have a single op.
	 * - not use grouped batching.
	 */
	containerRuntimeOptions?: IMockContainerRuntimeOptions;

	/**
	 * Whether or not to skip minimization of fuzz failing test cases. This is useful
	 * when one only cares about the counts or types of errors, and not the
	 * exact contents of the test cases.
	 *
	 * Minimization only works when the failure occurs as part of a reducer, and is mostly
	 * useful if the model being tested defines {@link DDSFuzzModel.minimizationTransforms}.
	 *
	 * It can also add a couple seconds of overhead per failing
	 * test case. See {@link @fluid-private/stochastic-test-utils#MinimizationTransform} for additional context.
	 */
	skipMinimization?: boolean;

	/**
	 * An optional IdCompressor that will be passed to the constructed MockDataStoreRuntime instance.
	 */
	idCompressorFactory?: (summary?: FuzzSerializedIdCompressor) => IIdCompressor;

	/**
	 * This preserves the old seed behavior where the whole fuzz tests gets a single seed.
	 * This creates issues as small changes, like adding a new random usage,
	 * can result in a cascade of changes to the test, which can invalidate current skips.
	 *
	 * The new behavior generates a seed per operation, which leads to more stable results, as
	 * random calls within a generator or reducer do not cascade to other generators or reducers.
	 *
	 * @deprecated This is option is for back-compat only. Once all usages are removed, it should also be removed.
	 */
	forceGlobalSeed?: true;

	/**
	 * If enabled, connection state change operations will sometimes use squashed resubmits.
	 */
	testSquashResubmit?: true;
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
	rollbackProbability: 0.01,
};

/**
 * Mixes in functionality to add new clients to a DDS fuzz model.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export function mixinNewClient<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzHarnessModel<
	TChannelFactory,
	TOperation | AddClient<TClientConfiguration>,
	TState,
	TClientConfiguration
> {
	type Add = AddClient<TClientConfiguration>;
	const isClientAddOp = (op: TOperation | Add): op is Add => op.type === "addClient";

	const generatorFactory: () => AsyncGenerator<TOperation | Add, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state: TState): Promise<TOperation | Add | typeof done> => {
			const { clients, random, isDetached } = state;
			if (
				options.clientJoinOptions !== undefined &&
				clients.length < options.clientJoinOptions.maxNumberOfClients &&
				!isDetached &&
				random.bool(options.clientJoinOptions.clientAddProbability)
			) {
				const operation: Add = {
					type: "addClient",
					addedClientId: makeFriendlyClientId(random, clients.length),
					canBeStashed: options.clientJoinOptions?.stashableClientProbability
						? random.bool(options.clientJoinOptions.stashableClientProbability)
						: false,
				};
				if (model.clientConfiguration !== undefined) {
					operation.clientConfiguration = generateClientConfiguration(
						model.clientConfiguration,
						random,
						operation.addedClientId,
					);
				}
				return operation;
			}
			return baseGenerator(state);
		};
	};

	const minimizationTransforms: MinimizationTransform<TOperation | Add>[] =
		(model.minimizationTransforms as MinimizationTransform<TOperation | Add>[] | undefined) ??
		[];

	minimizationTransforms.push((op: TOperation | Add): void => {
		if (isClientAddOp(op)) {
			op.canBeStashed = false;
		}
	});

	const reducer: AsyncReducer<TOperation | Add, TState> = async (state, op) => {
		if (isClientAddOp(op)) {
			const newClient = await loadClient(
				state.containerRuntimeFactory,
				state.summarizerClient,
				resolveClientFactory(model, op.clientConfiguration),
				op.addedClientId,
				options,
				op.canBeStashed,
				op.clientConfiguration,
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
 * Mixes in functionality to disconnect and reconnect clients in a DDS fuzz model.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export function mixinReconnect<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
	options: DDSFuzzSuiteOptions,
	isReconnectAllowed = (state: TState): boolean => !state.isDetached,
): DDSFuzzHarnessModel<
	TChannelFactory,
	TOperation | ChangeConnectionState,
	TState,
	TClientConfiguration
> {
	const generatorFactory: () => AsyncGenerator<TOperation | ChangeConnectionState, TState> =
		() => {
			const baseGenerator = model.generatorFactory();
			return async (state): Promise<TOperation | ChangeConnectionState | typeof done> => {
				const baseOp = baseGenerator(state);
				if (isReconnectAllowed(state) && state.random.bool(options.reconnectProbability)) {
					const op: ChangeConnectionState = {
						type: "changeConnectionState",
						connected: !state.client.containerRuntime.connected,
						squash: false,
					};
					if (options.testSquashResubmit === true && op.connected && state.random.bool(0.5)) {
						op.squash = true;
					}
					return op;
				}

				return baseOp;
			};
		};

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | ChangeConnectionState>[]
		| undefined;

	const reducer: AsyncReducer<TOperation | ChangeConnectionState, TState> = async (
		state,
		operation,
	) => {
		if (isOperationType<ChangeConnectionState>("changeConnectionState", operation)) {
			if (operation.squash === true) {
				reconnectAndSquash(state.client.containerRuntime, state.client.dataStoreRuntime);
			} else {
				state.client.containerRuntime.connected = operation.connected;
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

/**
 * Mixes in functionality to generate an 'attach' op, which
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export function mixinAttach<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzHarnessModel<
	TChannelFactory,
	TOperation | Attach<TClientConfiguration> | Attaching | Rehydrate,
	TState,
	TClientConfiguration
> {
	type AttachOperation = Attach<TClientConfiguration>;
	const { numOpsBeforeAttach, rehydrateDisabled, attachingBeforeRehydrateDisable } =
		options.detachedStartOptions;
	if (numOpsBeforeAttach === 0) {
		// not wrapping the reducer/generator in this case makes stepping through the harness slightly less painful.
		return model as DDSFuzzHarnessModel<
			TChannelFactory,
			TOperation | AttachOperation | Attaching | Rehydrate,
			TState,
			TClientConfiguration
		>;
	}
	const attachOp = async (state: TState): Promise<AttachOperation> => {
		const configuration = model.clientConfiguration;
		return configuration === undefined
			? { type: "attach" }
			: {
					type: "attach",
					clients: Array.from({ length: options.numberOfClients }, (_, index) =>
						generateClientInitialization(
							configuration,
							state.random,
							index === 0 ? "summarizer" : makeFriendlyClientId(state.random, index),
							options,
						),
					),
				};
	};
	const rehydrateOp = async (): Promise<
		TOperation | AttachOperation | Attaching | Rehydrate
	> => {
		return { type: "rehydrate" };
	};
	const generatorFactory: () => AsyncGenerator<
		TOperation | AttachOperation | Attaching | Rehydrate,
		TState
	> = () => {
		const baseGenerator = model.generatorFactory();
		const rehydrates = rehydrateDisabled
			? []
			: [
					// sometimes mix a single attaching op
					// in before rehydrate so we test
					// applying stashed ops while detached
					createWeightedAsyncGenerator<
						TOperation | AttachOperation | Attaching | Rehydrate,
						TState
					>([
						[takeAsync(numOpsBeforeAttach, baseGenerator), numOpsBeforeAttach],
						[
							takeAsync(
								1,
								async (): Promise<Attaching> => ({
									type: "attaching",
									beforeRehydrate: true,
								}),
							),
							attachingBeforeRehydrateDisable === true ? 0 : 1,
						],
					]),
					takeAsync(1, rehydrateOp),
				];
		return chainAsync(
			...rehydrates,
			takeAsync(numOpsBeforeAttach, baseGenerator),
			takeAsync(1, attachOp),
			baseGenerator,
		);
	};

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | AttachOperation | Attaching | Rehydrate>[]
		| undefined;

	const reducer: AsyncReducer<
		TOperation | AttachOperation | Attaching | Rehydrate,
		TState
	> = async (state, operation) => {
		if (isOperationType<AttachOperation>("attach", operation)) {
			requireClientInitializations(model.clientConfiguration, operation.clients);
			state.isDetached = false;
			assert.equal(state.clients.length, 1);
			const clientA: ClientWithStashData<TChannelFactory, TClientConfiguration> =
				state.clients[0];
			if (clientA.dataStoreRuntime.attachState === AttachState.Detached) {
				finalizeAllocatedIds(clientA);
			}
			clientA.dataStoreRuntime.setAttachState(AttachState.Attached);
			const services: IChannelServices = {
				deltaConnection: clientA.dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			clientA.channel.connect(services);
			const clients = await Promise.all(
				operation.clients === undefined
					? Array.from({ length: options.numberOfClients }, async (_, index) =>
							loadClient<TChannelFactory, TClientConfiguration>(
								state.containerRuntimeFactory,
								clientA,
								model.factory,
								index === 0 ? "summarizer" : makeFriendlyClientId(state.random, index),
								options,
								index !== 0 && options.clientJoinOptions?.stashableClientProbability
									? state.random.bool(options.clientJoinOptions.stashableClientProbability)
									: false,
							),
						)
					: operation.clients.map(async (client) =>
							loadClient(
								state.containerRuntimeFactory,
								clientA,
								resolveClientFactory(model, client.clientConfiguration),
								client.clientId,
								options,
								client.canBeStashed,
								client.clientConfiguration,
							),
						),
			);
			// eslint-disable-next-line require-atomic-updates
			clientA.stashData = undefined;

			// While detached, the initial state was set up so that the 'summarizer client' was the same as the detached client.
			// This is actually a pretty reasonable representation of what really happens.
			// However, now that we're transitioning to an attached state, the summarizer client should never have any edits.
			// Thus we use one of the clients we just loaded as the summarizer client, and keep the client around that we generated the
			// attach summary from.
			const summarizerClient = clients[0];
			clients[0] = state.clients[0];

			return {
				...state,
				isDetached: false,
				clients,
				summarizerClient,
			};
		} else if (isOperationType<Rehydrate>("rehydrate", operation)) {
			const clientA = state.clients[0];
			assert.equal(state.clients.length, 1);

			state.containerRuntimeFactory.removeContainerRuntime(clientA.containerRuntime);

			// TODO: AB#43127: Using a detached load here is not right with respect to id compressor ops in all cases.
			// The general strategy that the mocks use for resubmit does not align with the production implementation,
			// and that should probably be rectified here. The immediate problem with using `loadDetached` here is that
			// it finalizes IDs, which is only OK if this rehydrate is happening while the container is detached (not attaching).
			// See comment on `attachingBeforeRehydrateDisable` for more context.
			const summarizerClient = await loadDetached(
				state.containerRuntimeFactory,
				clientA,
				resolveClientFactory(model, clientA.clientConfiguration),
				makeFriendlyClientId(state.random, 0),
				options,
				clientA.clientConfiguration,
			);

			await model.validateConsistency(clientA, summarizerClient);

			return {
				...state,
				isDetached: true,
				clients: [summarizerClient],
				summarizerClient,
			};
		} else if (isOperationType<Attaching>("attaching", operation)) {
			assert.equal(state.clients.length, 1);
			const clientA: ClientWithStashData<IChannelFactory> = state.clients[0];
			finalizeAllocatedIds(clientA);

			if (operation.beforeRehydrate === true) {
				clientA.stashData = createLoadData(clientA, true);
			}
			clientA.dataStoreRuntime.setAttachState(AttachState.Attaching);
			const services: IChannelServices = {
				deltaConnection: clientA.dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			clientA.channel.connect(services);

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

/**
 * Mixes in functionality to rebase in-flight batches in a DDS fuzz model. A batch is rebased by
 * resending it to the datastores before being sent over the wire.
 *
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export function mixinRebase<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzHarnessModel<
	TChannelFactory,
	TOperation | TriggerRebase,
	TState,
	TClientConfiguration
> {
	const generatorFactory: () => AsyncGenerator<TOperation | TriggerRebase, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | TriggerRebase | typeof done> => {
			const baseOp = baseGenerator(state);
			if (state.random.bool(options.rebaseProbability)) {
				const client = state.clients.find((c) => c.channel.id === state.client.channel.id);
				assert(client !== undefined);
				return {
					type: "rebase",
				};
			}

			return baseOp;
		};
	};

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | TriggerRebase>[]
		| undefined;

	const reducer: AsyncReducer<TOperation | TriggerRebase, TState> = async (
		state,
		operation,
	) => {
		if (isOperationType<TriggerRebase>("rebase", operation)) {
			assert(
				state.client.containerRuntime.rebase !== undefined,
				"Unsupported mock runtime version",
			);
			state.client.containerRuntime.rebase();
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

/**
 * Mixes in functionality to generate ops which synchronize all clients and assert the resulting state is consistent.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export function mixinSynchronization<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzHarnessModel<
	TChannelFactory,
	TOperation | Synchronize,
	TState,
	TClientConfiguration
> {
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
								.filter((client) => client.containerRuntime.connected)
								.filter(() => state.random.bool(validationStrategy.clientProbability))
								.map((client) => client.channel.id),
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
				(client) => client.containerRuntime.connected,
			);

			for (const client of connectedClients) {
				assert(
					client.containerRuntime.flush !== undefined,
					"Unsupported mock runtime version",
				);
				client.containerRuntime.flush();
			}

			state.containerRuntimeFactory.processAllMessages();
			if (connectedClients.length > 0) {
				const readonlyChannel = state.summarizerClient;
				for (const client of connectedClients) {
					try {
						await model.validateConsistency(client, readonlyChannel);
					} catch (error: unknown) {
						if (error instanceof Error) {
							error.message = `Comparing client ${client.channel.id} vs client ${readonlyChannel.channel.id}\n${error.message}`;
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

export function setupClientContext(
	state: DDSFuzzTestState<IChannelFactory>,
	client: Client<IChannelFactory>,
): CleanupFunction {
	const { client: oldClient, random } = state;
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const { handle: oldHandle } = random;

	state.client = client;
	random.handle = () => new DDSFuzzHandle(random.pick(handles), client.dataStoreRuntime);
	return () => {
		state.client = oldClient;
		state.random.handle = oldHandle;
	};
}

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
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
	_: DDSFuzzSuiteOptions,
	setupClientState: (
		state: TState,
		client: TState["client"],
	) => CleanupFunction = setupClientContext,
): DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration> {
	const generatorFactory: () => AsyncGenerator<TOperation, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | typeof done> => {
			// Pick a channel, and:
			// 1. Make it available for the DDS model generators (so they don't need to
			// do the boilerplate of selecting a client to perform the operation on)
			// 2. Make it available to the subsequent reducer logic we're going to inject
			// (so that we can recover the channel from serialized data)
			const client = state.random.pick(state.clients);
			const baseOp = await runInStateWithClient(state, client, setupClientState, async () =>
				baseGenerator(state),
			);
			return baseOp === done
				? done
				: {
						...baseOp,
						clientId: client.channel.id,
					};
		};
	};

	const reducer: AsyncReducer<TOperation | Synchronize, TState> = async (state, operation) => {
		assert(isClientSpec(operation), "operation should have been given a client");
		const client = state.clients.find((c) => c.channel.id === operation.clientId);
		assert(client !== undefined);
		await runInStateWithClient(state, client, setupClientState, async () =>
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
 * Mixes in functionality to allow for rollback operations in a DDS fuzz model and applies them during state transitions.
 */
export function mixinRollback<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzHarnessModel<TChannelFactory, TOperation | Rollback, TState, TClientConfiguration> {
	const generatorFactory: () => AsyncGenerator<TOperation | Rollback, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | Rollback | typeof done> => {
			const baseOp = await baseGenerator(state);
			if (baseOp !== done && state.random.bool(options.rollbackProbability)) {
				return {
					type: "applyThenRollback",
					ddsOp: baseOp,
				};
			}

			return baseOp;
		};
	};

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | Rollback>[]
		| undefined;

	const reducer: AsyncReducer<TOperation | Rollback, TState> = async (state, operation) => {
		if (isOperationType<Rollback>("applyThenRollback", operation)) {
			state.client.containerRuntime.flush();
			await state.client.containerRuntime.runWithManualFlush(async () => {
				await model.reducer(state, operation.ddsOp as TOperation);
			});
			state.client.containerRuntime.rollback?.();
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

export function mixinStashedClient<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<TChannelFactory, TOperation, TState, TClientConfiguration>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzHarnessModel<
	TChannelFactory,
	TOperation | StashClient,
	TState,
	TClientConfiguration
> {
	if (options.clientJoinOptions?.stashableClientProbability === undefined) {
		return model as DDSFuzzHarnessModel<
			TChannelFactory,
			TOperation | StashClient,
			TState,
			TClientConfiguration
		>;
	}

	const generatorFactory: () => AsyncGenerator<TOperation | StashClient, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | StashClient | typeof done> => {
			const stashable = state.clients.filter(
				(c) => hasStashData(c) && c.containerRuntime.isDirty,
			);

			if (!state.isDetached && stashable.length > 0 && state.random.bool(0.5)) {
				const existingClientId = state.random.pick(stashable).channel.id;
				const instanceIndex = existingClientId.lastIndexOf("_");
				const instance =
					instanceIndex < 0
						? 0
						: Number.parseInt(existingClientId.slice(instanceIndex + 1), 10);
				return {
					type: "stashClient",
					existingClientId,
					newClientId: `${existingClientId}_${instance + 1}`,
				};
			}
			return baseGenerator(state);
		};
	};

	const reducer: AsyncReducer<TOperation | StashClient, TState> = async (state, operation) => {
		const { clients, containerRuntimeFactory } = state;
		if (isOperationType<StashClient>("stashClient", operation)) {
			const client = clients.find((c) => c.channel.id === operation.existingClientId);
			if (!hasStashData(client)) {
				throw new ReducerPreconditionError("client not stashable");
			}
			const loadData = createLoadDataFromStashData(client, client.stashData);

			// load a new client from the same state as the original client
			const newClient = await loadClientFromSummaries(
				containerRuntimeFactory,
				loadData,
				resolveClientFactory(model, client.clientConfiguration),
				operation.newClientId,
				options,
				false,
				client.clientConfiguration,
			);

			await newClient.containerRuntime.initializeWithStashedOps(client.containerRuntime);

			// replace the old client with the new client
			return {
				...state,
				clients: [...clients.filter((c) => c.channel.id !== client.channel.id), newClient],
			};
		}

		return model.reducer(state, operation);
	};

	return {
		...model,
		generatorFactory,
		reducer,
		minimizationTransforms: model.minimizationTransforms as MinimizationTransform<
			TOperation | StashClient
		>[],
	};
}

export const handles = Array.from({ length: 100 }, (_, index) => `handle_${index}`);

/**
 * Callback invoked on "cleanup" of some associated operation.
 *
 * This is the same dispose callback pattern used by our eventing library in common-utils.
 */
export type CleanupFunction = () => void;

/**
 * This modifies the value of "client" while callback is running, then restores it.
 * This is does instead of copying the state since the state object is mutable, and running callback might make changes to state (like add new members) which are lost if state is just copied.
 *
 * Since the callback is async, this modification to the state could be an issue if multiple runs of this function are done concurrently.
 */
async function runInStateWithClient<TState extends DDSFuzzTestState<IChannelFactory>, Result>(
	state: TState,
	client: TState["client"],
	setupClientState: (state: TState, client: TState["client"]) => CleanupFunction,
	callback: (state: TState) => Promise<Result>,
): Promise<Result> {
	const cleanup = setupClientState(state, client);
	try {
		return await callback(state);
	} finally {
		cleanup();
	}
}

function createDetachedClient<TChannelFactory extends IChannelFactory, TClientConfiguration>(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	factory: TChannelFactory,
	clientId: string,
	options: Omit<DDSFuzzSuiteOptions, "only" | "skip">,
	clientConfiguration?: TClientConfiguration,
): Client<TChannelFactory, TClientConfiguration> {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		clientId,
		idCompressor:
			options.idCompressorFactory === undefined ? undefined : options.idCompressorFactory(),
		attachState: AttachState.Detached,
	});
	// Note: we re-use the clientId for the channel id here despite connecting all clients to the same channel:
	// this isn't how it would work in a real scenario, but the mocks don't use the channel id for any message
	// routing behavior and making all of the object ids consistent helps with debugging and writing more informative
	// consistency validation.
	const channel: ReturnType<typeof factory.create> = factory.create(
		dataStoreRuntime,
		clientId,
	);
	setupFuzzSerializer(channel, dataStoreRuntime);

	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime, {
		// only track remote ops(which enables initialize from stashed ops), if rehydrate is enabled
		trackRemoteOps: options.detachedStartOptions.rehydrateDisabled !== true,
	});
	// TS resolves the return type of model.factory.create too early and isn't able to retain a more specific type
	// than IChannel here.
	const newClient: Client<TChannelFactory, TClientConfiguration> = {
		containerRuntime,
		dataStoreRuntime,
		channel: channel as ReturnType<TChannelFactory["create"]>,
		...(clientConfiguration === undefined ? {} : { clientConfiguration }),
	};
	options.emitter.emit("clientCreate", newClient);
	return newClient;
}

async function loadClient<TChannelFactory extends IChannelFactory, TClientConfiguration>(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	summarizerClient: ClientWithStashData<TChannelFactory>,
	factory: TChannelFactory,
	clientId: string,
	options: Omit<DDSFuzzSuiteOptions, "only" | "skip">,
	supportStashing: boolean = false,
	clientConfiguration?: TClientConfiguration,
): Promise<ClientWithStashData<TChannelFactory, TClientConfiguration>> {
	const loadData: ClientLoadData =
		summarizerClient.stashData === undefined
			? createLoadData(summarizerClient, false)
			: createLoadDataFromStashData(summarizerClient, summarizerClient.stashData);
	return loadClientFromSummaries(
		containerRuntimeFactory,
		loadData,
		factory,
		clientId,
		options,
		supportStashing,
		clientConfiguration,
	);
}

function setupFuzzSerializer(
	channel: IChannel,
	dataStoreRuntime: MockFluidDataStoreRuntime,
): void {
	// TODO:AB#36300 tracks refactoring code to allow something like this without access violation.
	assert(
		isFluidSerializerLike(
			(channel as unknown as { _serializer: IFluidSerializer })._serializer,
		),
		"expected SharedObject to store its serializer at key '_serializer'.",
	);
	(channel as unknown as { _serializer: IFluidSerializer })._serializer =
		new DDSFuzzSerializer(dataStoreRuntime.channelsRoutingContext, dataStoreRuntime.id);
}

function isFluidSerializerLike(object: unknown): object is IFluidSerializer {
	return (
		typeof object === "object" &&
		object !== null &&
		"encode" in object &&
		"decode" in object &&
		"stringify" in object &&
		"parse" in object
	);
}

async function loadClientFromSummaries<
	TChannelFactory extends IChannelFactory,
	TClientConfiguration,
>(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	loadData: ClientLoadData,
	factory: TChannelFactory,
	clientId: string,
	options: Omit<DDSFuzzSuiteOptions, "only" | "skip">,
	supportStashing: boolean = false,
	clientConfiguration?: TClientConfiguration,
): Promise<ClientWithStashData<TChannelFactory, TClientConfiguration>> {
	const { summaries, minimumSequenceNumber } = loadData;
	const stashData = supportStashing ? structuredClone(loadData) : undefined;

	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		clientId,
		idCompressor:
			options.idCompressorFactory === undefined || summaries.idCompressorSummary === undefined
				? undefined
				: options.idCompressorFactory(summaries.idCompressorSummary),
	});
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime, {
		minimumSequenceNumber,
		trackRemoteOps: supportStashing,
	});
	const services: IChannelServices = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: MockStorage.createFromSummary(summaries.summary),
	};

	const channel = (await factory.load(
		dataStoreRuntime,
		clientId,
		services,
		factory.attributes,
	)) as ReturnType<TChannelFactory["create"]>;
	setupFuzzSerializer(channel, dataStoreRuntime);
	channel.connect(services);

	const newClient: ClientWithStashData<TChannelFactory, TClientConfiguration> = {
		channel,
		containerRuntime,
		dataStoreRuntime,
		stashData,
		...(clientConfiguration === undefined ? {} : { clientConfiguration }),
	};

	options.emitter.emit("clientCreate", newClient);
	return newClient;
}

async function loadDetached<TChannelFactory extends IChannelFactory, TClientConfiguration>(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	summarizerClient: ClientWithStashData<TChannelFactory>,
	factory: TChannelFactory,
	clientId: string,
	options: Omit<DDSFuzzSuiteOptions, "only" | "skip">,
	clientConfiguration?: TClientConfiguration,
): Promise<Client<TChannelFactory, TClientConfiguration>> {
	// as in production, emulate immediate finalizing of IDs when attaching
	finalizeAllocatedIds(summarizerClient);

	const { summaries } =
		summarizerClient.stashData === undefined
			? createLoadData(summarizerClient, true)
			: createLoadDataFromStashData(summarizerClient, summarizerClient.stashData);

	const idCompressor = options.idCompressorFactory?.(summaries.idCompressorSummary);

	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		clientId,
		idCompressor,
		attachState: AttachState.Detached,
	});
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services: IChannelServices = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: MockStorage.createFromSummary(summaries.summary),
	};

	const channel = (await factory.load(
		dataStoreRuntime,
		clientId,
		services,
		factory.attributes,
	)) as ReturnType<TChannelFactory["create"]>;

	if (summarizerClient.stashData) {
		await containerRuntime.initializeWithStashedOps(summarizerClient.containerRuntime);
	}

	const newClient: Client<TChannelFactory, TClientConfiguration> = {
		channel,
		containerRuntime,
		dataStoreRuntime,
		...(clientConfiguration === undefined ? {} : { clientConfiguration }),
	};
	options.emitter.emit("clientCreate", newClient);
	return newClient;
}

function finalizeAllocatedIds(client: {
	dataStoreRuntime: { idCompressor?: IIdCompressor };
}): void {
	const compressor = client.dataStoreRuntime.idCompressor;
	if (compressor !== undefined) {
		const compressorCore = toIdCompressorWithCore(compressor);
		const range = compressorCore.takeNextCreationRange();
		if (range.ids !== undefined) {
			compressorCore.finalizeCreationRange(range);
		}
	}
}

/**
 * Gets a friendly ID for a client based on its index in the client list.
 * This exists purely for easier debugging--reasoning about client "A" is easier than reasoning
 * about client "3e8a621a-7b35-414b-897f-8795962fb415".
 */
function makeFriendlyClientId(random: IRandom, index: number): string {
	return index < 26 ? String.fromCodePoint(index + 65) : random.uuid4();
}

/**
 * Resolves only recorded configurations; reducers must not generate new choices.
 */
function resolveClientFactory<TChannelFactory extends IChannelFactory, TClientConfiguration>(
	model: {
		factory: TChannelFactory;
		clientConfiguration?: DDSFuzzClientConfiguration<TChannelFactory, TClientConfiguration>;
	},
	clientConfiguration: TClientConfiguration | undefined,
): TChannelFactory {
	if (model.clientConfiguration === undefined) {
		if (clientConfiguration !== undefined) {
			throw new ReducerPreconditionError("Recorded clientConfiguration requires a resolver.");
		}
		return model.factory;
	}
	if (clientConfiguration === undefined) {
		throw new ReducerPreconditionError("Missing recorded clientConfiguration.");
	}
	return model.clientConfiguration.factory(clientConfiguration);
}

function generateClientConfiguration<
	TChannelFactory extends IChannelFactory,
	TClientConfiguration,
>(
	configuration: DDSFuzzClientConfiguration<TChannelFactory, TClientConfiguration>,
	random: IRandom,
	clientId: string,
): TClientConfiguration {
	const value = configuration.generate(random, {
		clientId,
		isSummarizer: clientId === "summarizer",
	});
	const serialized = JSON.stringify(value);
	assert(serialized !== undefined, "clientConfiguration must be JSON-serializable.");
	const copy: unknown = JSON.parse(serialized);
	assert.deepEqual(value, copy, "clientConfiguration must round-trip through JSON.");
	return copy as TClientConfiguration;
}

function generateClientInitialization<
	TChannelFactory extends IChannelFactory,
	TClientConfiguration,
>(
	configuration: DDSFuzzClientConfiguration<TChannelFactory, TClientConfiguration>,
	random: IRandom,
	clientId: string,
	options: Omit<DDSFuzzSuiteOptions, "only" | "skip">,
	supportStashing = true,
): ClientInitialization<TClientConfiguration> {
	return {
		clientId,
		clientConfiguration: generateClientConfiguration(configuration, random, clientId),
		canBeStashed:
			supportStashing &&
			clientId !== "summarizer" &&
			options.clientJoinOptions?.stashableClientProbability
				? random.bool(options.clientJoinOptions.stashableClientProbability)
				: false,
	};
}

function requireClientInitializations(
	configuration: unknown,
	clients: readonly ClientInitialization[] | undefined,
): void {
	if ((configuration === undefined) !== (clients === undefined)) {
		throw new ReducerPreconditionError(
			"Recorded client initializations must match whether client configuration is enabled.",
		);
	}
}

async function initializeTestState<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TClientConfiguration,
>(
	model: DDSFuzzHarnessModel<
		TChannelFactory,
		TOperation,
		DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
		TClientConfiguration
	>,
	options: Omit<DDSFuzzSuiteOptions, "only" | "skip">,
	random: IRandom,
	initialization?: Initialize<TClientConfiguration>,
): Promise<DDSFuzzTestState<TChannelFactory, TClientConfiguration>> {
	const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection(
		options.containerRuntimeOptions,
	);

	const startDetached = options.detachedStartOptions.numOpsBeforeAttach !== 0;
	const initialClient = createDetachedClient(
		containerRuntimeFactory,
		resolveClientFactory(model, initialization?.initialClient.clientConfiguration),
		initialization?.initialClient.clientId ??
			(startDetached ? makeFriendlyClientId(random, 0) : "summarizer"),
		options,
		initialization?.initialClient.clientConfiguration,
	);
	if (!startDetached) {
		finalizeAllocatedIds(initialClient);
		initialClient.dataStoreRuntime.setAttachState(AttachState.Attached);
		const services: IChannelServices = {
			deltaConnection: initialClient.dataStoreRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		initialClient.channel.connect(services);
	}

	const clients = startDetached
		? [initialClient]
		: await Promise.all(
				initialization === undefined
					? Array.from({ length: options.numberOfClients }, async (_, i) =>
							loadClient<TChannelFactory, TClientConfiguration>(
								containerRuntimeFactory,
								initialClient,
								model.factory,
								makeFriendlyClientId(random, i),
								options,
								options.clientJoinOptions?.stashableClientProbability
									? random.bool(options.clientJoinOptions.stashableClientProbability)
									: false,
							),
						)
					: initialization.clients.map(async (client) =>
							loadClient(
								containerRuntimeFactory,
								initialClient,
								resolveClientFactory(model, client.clientConfiguration),
								client.clientId,
								options,
								client.canBeStashed,
								client.clientConfiguration,
							),
						),
			);
	const summarizerClient = initialClient;
	const initialState: DDSFuzzTestState<TChannelFactory, TClientConfiguration> = {
		clients,
		summarizerClient,
		containerRuntimeFactory,
		random: {
			...random,
			// This is injected by client selection logic, which allows binding the handle
			// to an appropriate client context.
			handle: makeUnreachableCodePathProxy("random.handle"),
		},
		client: makeUnreachableCodePathProxy("client"),
		isDetached: startDetached,
	};

	options.emitter.emit("testStart", initialState);
	return initialState;
}

function createSerializationContext(initialState: DDSFuzzTestState<IChannelFactory>): {
	serializer: DDSFuzzSerializer;
	dummyHandleBindSource: ISharedObjectHandle;
} {
	const serializer = new DDSFuzzSerializer(
		initialState.summarizerClient.dataStoreRuntime,
		initialState.summarizerClient.dataStoreRuntime.id,
		false,
	);

	// This is unfortunately needed to pass to the Serializer, even though we don't do any handle binding.
	const dummyHandleBindSource = Object.assign(
		new DDSFuzzHandle("", initialState.summarizerClient.dataStoreRuntime),
		{ bind: () => {} },
	);
	assert(
		isISharedObjectHandle(dummyHandleBindSource),
		"PRECONDITION: must satisfy this for serializer",
	);
	return { serializer, dummyHandleBindSource };
}

/**
 * Runs the provided DDS fuzz model. All functionality is already assumed to be mixed in.
 * @privateRemarks This is currently file-exported for testing purposes, but it could be reasonable to
 * expose at the package level if we want to expose some of the harness's building blocks.
 */
export async function runTestForSeed<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<
		TChannelFactory,
		TOperation,
		DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
		TClientConfiguration
	>,
	options: Omit<DDSFuzzSuiteOptions, "only" | "skip">,
	seed: number,
	saveInfo?: SaveInfo,
	replayGenerator?: AsyncGenerator<TOperation | Initialize<TClientConfiguration>, unknown>,
): Promise<DDSFuzzTestState<TChannelFactory, TClientConfiguration>> {
	const random = makeRandom(seed);
	let needsInitialization = model.clientConfiguration !== undefined;
	// Configured tests construct clients in a reducer so that setup choices (and failures) are recorded.
	const initialState: DDSFuzzTestState<TChannelFactory, TClientConfiguration> =
		needsInitialization
			? {
					random: { ...random, handle: makeUnreachableCodePathProxy("random.handle") },
					clients: makeUnreachableCodePathProxy("clients before initialization"),
					client: makeUnreachableCodePathProxy("client"),
					summarizerClient: makeUnreachableCodePathProxy("summarizer before initialization"),
					containerRuntimeFactory: makeUnreachableCodePathProxy(
						"runtime before initialization",
					),
					isDetached: options.detachedStartOptions.numOpsBeforeAttach !== 0,
				}
			: await initializeTestState(model, options, random);
	let serializationContext = needsInitialization
		? undefined
		: createSerializationContext(initialState);

	let operationCount = 0;
	let generator =
		replayGenerator ?? (needsInitialization ? undefined : model.generatorFactory());
	const finalState = await performFuzzActionsAsync<
		TOperation | Initialize<TClientConfiguration>,
		typeof initialState
	>(
		// performFuzzActionsAsync expects generators to return JSON-serializable objects.
		// To make this work with handles that the DDS model may have generated, we use the FluidSerializer above
		// to encode here and decode in the reducer.
		async (state) => {
			if (needsInitialization && replayGenerator === undefined) {
				const configuration = model.clientConfiguration;
				assert(configuration !== undefined, "Expected client configuration.");
				return {
					type: "initialize",
					initialClient: generateClientInitialization(
						configuration,
						state.random,
						state.isDetached ? makeFriendlyClientId(state.random, 0) : "summarizer",
						options,
						false,
					),
					clients: state.isDetached
						? []
						: Array.from({ length: options.numberOfClients }, (_, index) =>
								generateClientInitialization(
									configuration,
									state.random,
									makeFriendlyClientId(state.random, index),
									options,
								),
							),
				};
			}
			assert(generator !== undefined, "Expected initialized workload generator.");
			const operation = await generator(state);
			return serializationContext === undefined ||
				(model.clientConfiguration !== undefined &&
					operation !== done &&
					isClientConfigurationOperation(operation))
				? operation
				: (serializationContext.serializer.encode(
						operation,
						serializationContext.dummyHandleBindSource,
					) as TOperation);
		},
		async (state, operation) => {
			if (needsInitialization) {
				if (!isOperationType<Initialize<TClientConfiguration>>("initialize", operation)) {
					throw new ReducerPreconditionError("Configured tests must start with initialize.");
				}
				options.emitter.emit("operation", operation);
				needsInitialization = false;
				const initializedState = await initializeTestState(
					model,
					options,
					state.random,
					operation,
				);
				serializationContext = createSerializationContext(initializedState);
				generator ??= model.generatorFactory();
				return initializedState;
			}
			if (model.clientConfiguration !== undefined && operation.type === "initialize") {
				throw new ReducerPreconditionError("Unexpected initialize operation.");
			}
			assert(serializationContext !== undefined, "Expected initialized serialization.");
			// Configuration is plain JSON owned by the consumer, not Fluid-serialized data.
			const decodedHandles =
				model.clientConfiguration !== undefined && isClientConfigurationOperation(operation)
					? (operation as TOperation)
					: (serializationContext.serializer.decode(operation) as TOperation);
			options.emitter.emit("operation", decodedHandles);
			operationCount++;
			return model.reducer(state, decodedHandles);
		},
		initialState,
		saveInfo,
		options.forceGlobalSeed,
	);

	if (needsInitialization) {
		throw new ReducerPreconditionError("Configured tests must start with initialize.");
	}
	// Sanity-check that the generator produced at least one operation. If it failed to do so,
	// this usually indicates an error on the part of the test author.
	assert(operationCount > 0, "Generator should have produced at least one operation.");
	options.emitter.emit("testEnd", finalState);

	return finalState;
}

function isClientConfigurationOperation(operation: BaseOperation): boolean {
	return (
		operation.type === "initialize" ||
		operation.type === "addClient" ||
		operation.type === "attach"
	);
}

function runTest<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TClientConfiguration,
>(
	model: DDSFuzzHarnessModel<
		TChannelFactory,
		TOperation,
		DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
		TClientConfiguration
	>,
	options: InternalOptions,
	seed: number,
	saveInfo: SaveInfo | undefined,
	replayGenerator?: AsyncGenerator<TOperation | Initialize<TClientConfiguration>, unknown>,
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
			await runTestForSeed(model, options, seed, inCi ? undefined : saveInfo, replayGenerator);
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
			const operations = JSON.parse(file.toString()) as (
				| TOperation
				| Initialize<TClientConfiguration>
			)[];
			const transforms = model.minimizationTransforms?.map(
				(transform) => (operation: TOperation | Initialize<TClientConfiguration>) => {
					if (
						model.clientConfiguration === undefined ||
						!isOperationType<Initialize<TClientConfiguration>>("initialize", operation)
					) {
						transform(operation as TOperation);
					}
				},
			);
			const minimizer = new FuzzTestMinimizer(
				transforms,
				operations,
				saveInfo,
				async (generator) => replayTest(model, seed, generator, saveInfo, options),
				3,
			);

			const minimized = await minimizer.minimize();
			await saveOpsToFile(savePath, minimized);

			throw error;
		}
	});
}

interface InternalOnlyAndSkip {
	only: Set<number>;
	skip: Set<number>;
}

type InternalOptions = InternalOnlyAndSkip & Omit<DDSFuzzSuiteOptions, "only" | "skip">;

/**
 * Some reducers require preconditions be met which are validated by their generator.
 * The validation can be lost if the generator is not run.
 * The primary case where this happens is during minimization. If a reducer detects this
 * problem, they can throw this error type, and minimization will consider the current
 * test invalid, rather than continuing to test invalid scenarios.
 * @internal
 */
export class ReducerPreconditionError extends Error {}

export const normalizeSeedOption = (
	seeds: number | Iterable<number> | undefined,
): Iterable<number> => (typeof seeds === "number" ? [seeds] : (seeds ?? []));

/**
 * Performs the test again to verify if the DDS still fails with the same error message.
 *
 * @internal
 */
export async function replayTest<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<
		TChannelFactory,
		TOperation,
		DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
		TClientConfiguration
	>,
	seed: number,
	generator: AsyncGenerator<TOperation | Initialize<TClientConfiguration>, unknown>,
	saveInfo?: SaveInfo,
	providedOptions?: Partial<DDSFuzzSuiteOptions>,
): Promise<void> {
	const options = {
		...defaultDDSFuzzSuiteOptions,
		...providedOptions,
		only: new Set(normalizeSeedOption(providedOptions?.only)),
		skip: new Set(normalizeSeedOption(providedOptions?.skip)),
	};

	await runTestForSeed(model, options, seed, saveInfo, generator);
}

export function convertOnlyAndSkip<TOptions extends DDSFuzzSuiteOptions>(
	options: TOptions,
): InternalOnlyAndSkip & Omit<TOptions, "only" | "skip"> {
	const only = new Set(normalizeSeedOption(options.only));
	const skip = new Set(normalizeSeedOption(options.skip));
	Object.assign(options, { only, skip });
	return options as unknown as InternalOnlyAndSkip & Omit<TOptions, "only" | "skip">;
}

export function createSuite<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TClientConfiguration = unknown,
>(
	model: DDSFuzzHarnessModel<
		TChannelFactory,
		TOperation,
		DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
		TClientConfiguration
	>,
	options: InternalOptions,
): void {
	const describeFuzz = createFuzzDescribe({ defaultTestCount: options.defaultTestCount });

	if (options.forceGlobalSeed !== undefined && options.skip.size === 0) {
		// if this error is getting in your way while debugging just comment it out, but re-add before you checkin
		throw new Error(
			"Yay. You fixed all the skipped tests. Remove forceGlobalSeed from the options as it is no longer needed, and removing it will lead to more consistent results going forward." +
				"Please also do a search on the repo for forceGlobalSeed, and if they have all been removed, please remove the option, and its related code!",
		);
	}

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
			describe.only(`replay from file`, () => {
				for (const seed of normalizeSeedOption(options.replay)) {
					const saveInfo = getSaveInfo(model, options, seed);
					assert(
						saveInfo.saveOnFailure !== false,
						"Cannot replay a file without a directory to save files in!",
					);
					const operations = options.parseOperations(
						readFileSync(saveInfo.saveOnFailure.path).toString(),
					);

					// We lose some type safety here because the options interface isn't generic
					const replayGenerator = asyncGeneratorFromArray<
						TOperation | Initialize<TClientConfiguration>,
						unknown
					>(operations as (TOperation | Initialize<TClientConfiguration>)[]);
					runTest(model, options, seed, undefined, replayGenerator);
				}
			});
		}

		afterEach(() => {
			disposeAllOracles();
		});
	});
}

const activeOracles: Set<{ dispose: () => void }> = new Set();

/**
 * Tracks oracles created during fuzz runs so they can be disposed after each test.
 * @internal
 */
export function registerOracle(oracle: { dispose: () => void }): void {
	activeOracles.add(oracle);
}

/**
 * Dispose all oracles
 * @internal
 */
function disposeAllOracles(): void {
	for (const oracle of activeOracles) {
		oracle.dispose();
	}
	activeOracles.clear();
}

const getFullModel = <
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TClientConfiguration,
>(
	ddsModel: DDSFuzzModel<
		TChannelFactory,
		TOperation,
		DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
		TClientConfiguration
	>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzHarnessModel<
	TChannelFactory,
	| TOperation
	| Exclude<HarnessOperation<TClientConfiguration>, Initialize<TClientConfiguration>>,
	DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
	TClientConfiguration
> =>
	mixinAttach(
		mixinSynchronization(
			mixinNewClient(
				mixinStashedClient(
					mixinClientSelection(
						mixinReconnect(mixinRebase(mixinRollback(ddsModel, options), options), options),
						options,
					),
					options,
				),
				options,
			),
			options,
		),
		options,
	);

/**
 * Creates a suite of eventual consistency tests for a particular DDS model.
 * @internal
 */
export function createDDSFuzzSuite<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TClientConfiguration = unknown,
>(
	ddsModel: DDSFuzzModel<
		TChannelFactory,
		TOperation,
		DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
		TClientConfiguration
	>,
	providedOptions?: Partial<DDSFuzzSuiteOptions>,
): void {
	const options = convertOnlyAndSkip({ ...defaultDDSFuzzSuiteOptions, ...providedOptions });
	const model = getFullModel(ddsModel, options);
	createSuite(model, options);
}

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
		<
			TChannelFactory extends IChannelFactory,
			TOperation extends BaseOperation,
			TClientConfiguration = unknown,
		>(
			ddsModel: DDSFuzzModel<
				TChannelFactory,
				TOperation,
				DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
				TClientConfiguration
			>,
			providedOptions?: Partial<DDSFuzzSuiteOptions>,
		): void =>
			createDDSFuzzSuite(ddsModel, {
				...providedOptions,
				only: [...seeds, ...normalizeSeedOption(providedOptions?.only)],
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
		<
			TChannelFactory extends IChannelFactory,
			TOperation extends BaseOperation,
			TClientConfiguration = unknown,
		>(
			ddsModel: DDSFuzzModel<
				TChannelFactory,
				TOperation,
				DDSFuzzTestState<TChannelFactory, TClientConfiguration>,
				TClientConfiguration
			>,
			providedOptions?: Partial<DDSFuzzSuiteOptions>,
		): void =>
			createDDSFuzzSuite(ddsModel, {
				...providedOptions,
				skip: [...seeds, ...normalizeSeedOption(providedOptions?.skip)],
			});
}
