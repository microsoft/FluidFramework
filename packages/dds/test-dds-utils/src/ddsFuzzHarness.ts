/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { mkdirSync, readFileSync } from "fs";
import { strict as assert } from "assert";
import {
	BaseFuzzTestState,
	createFuzzDescribe,
	defaultOptions,
	done,
	ExitBehavior,
	AsyncGenerator as Generator,
	asyncGeneratorFromArray as generatorFromArray,
	interleaveAsync as interleave,
	IRandom,
	makeRandom,
	performFuzzActionsAsync as performFuzzActions,
	AsyncReducer as Reducer,
	repeatAsync as repeat,
	SaveInfo,
} from "@fluid-internal/stochastic-test-utils";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
} from "@fluidframework/test-runtime-utils";
import { IChannelFactory, IChannelServices } from "@fluidframework/datastore-definitions";
import { unreachableCase } from "@fluidframework/common-utils";

export interface Client<TChannelFactory extends IChannelFactory> {
	channel: ReturnType<TChannelFactory["create"]>;
	containerRuntime: MockContainerRuntimeForReconnection;
}

export interface DDSFuzzTestState<TChannelFactory extends IChannelFactory>
	extends BaseFuzzTestState {
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;

	/**
	 * Client which is responsible for summarizing. This client remains connected and read-only
	 * throughout the test.
	 *
	 * This client is also used for consistency validation, as eventual consistency bugs are
	 * typically easier to reason about when one client was readonly.
	 */
	summarizerClient: Client<TChannelFactory>;
	clients: Client<TChannelFactory>[];
	// Client which was selected to perform an operation on
	client: Client<TChannelFactory>;
	// dds which was selected to perform an operation on. will be the same as client.channel
	channel: ReturnType<TChannelFactory["create"]>;
}

export interface ClientSpec {
	clientId: string;
}

export interface BaseOperation {
	type: number | string;
}

export interface ChangeConnectionState {
	type: "changeConnectionState";
	connected: boolean;
}

export interface AddClient {
	type: "addClient";
	addedClientId: string;
}

export interface Synchronize {
	type: "synchronize";
}

interface HasWorkloadName {
	workloadName: string;
}

function getSaveDirectory(
	model: HasWorkloadName,
	options: DDSFuzzSuiteOptions,
): string | undefined {
	if (!options.saveFailures) {
		return undefined;
	}
	const workloadFriendly = model.workloadName.replace(/[\s_]+/g, "-").toLowerCase();
	return path.join(options.saveFailures.directory, workloadFriendly);
}

function getSaveInfo(
	model: HasWorkloadName,
	options: DDSFuzzSuiteOptions,
	seed: number,
): SaveInfo | undefined {
	const directory = getSaveDirectory(model, options);
	if (!directory) {
		return undefined;
	}
	const filepath = path.join(directory, `${seed}.json`);
	return { saveOnFailure: true, filepath };
}

/**
 * Represents a generic fuzz model for testing eventual consistency of a DDS.
 *
 * Typical DDSes will parameterize this with their SharedObject factory and a serializable set
 * of operations corresponding to valid edits in the DDS's public API.
 * @example
 * A simplified SharedString data structure exposing the APIs `insertAt(index, contentString)` and `removeRange(start, end)`
 * might represent their API with the following operations:
 * ```typescript
 * type InsertOperation = { type: "insert"; index: number; content: string }
 * type RemoveOperation = { type: "remove"; start: number; end: number }
 * type Operation = InsertOperation | RemoveOperation;
 * ```
 *
 * It would then typically use utilities from \@fluid-internal/stochastic-test-utils to write a generator
 * for inserting/removing content, and a reducer for interpreting the serializable operations in terms of
 * SimpleSharedString's public API.
 *
 * See \@fluid-internal/stochastic-test-utils's README for more details on this step.
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
 *     validateConsistency: (a, b) => { assert.equal(a.getText(), b.getText()); }
 * }
 * ```
 * This model can be used directly to create a suite of fuzz tests with {@link createDDSFuzzSuite}
 */
export interface DDSFuzzModel<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory> = DDSFuzzTestState<TChannelFactory>,
> {
	/**
	 * Name for this model. This is used for test case naming, and should generally reflect properties
	 * about the kinds of operations that are generated.
	 * For example, SharedString might fuzz test several different workloads--some involving intervals,
	 * some without, some that never delete text, etc.
	 * This name should also be relatively friendly for file system; if the "save to disk" option of
	 * {@link createDDSFuzzSuite} is enabled, it will be kebab cased for failure files.
	 */
	workloadName: string;

	/**
	 * ChannelFactory to instantiate the DDS.
	 */
	factory: TChannelFactory;

	/**
	 * Factory which creates a generator for this model.
	 * @remarks DDS model generators can decide to use the "channel" or "client" field to decide which
	 * client to perform the operation on.
	 */
	generatorFactory: () => Generator<TOperation, TState>;

	/**
	 * Reducer capable of updating the test state according to the operations generated.
	 */
	reducer: Reducer<TOperation, TState>;

	/**
	 * Equivalence validation function, which should verify that the provided channels contain the same data.
	 * This is run at each synchronization point for all connected clients (as disconnected clients won't
	 * necessarily have the same set of ops applied).
	 * @throws - An informative error if the channels don't have equivalent data.
	 */
	validateConsistency: (
		channelA: ReturnType<TChannelFactory["create"]>,
		channelB: ReturnType<TChannelFactory["create"]>,
	) => void;
}

interface DDSFuzzSuiteOptions {
	/**
	 * Number of tests to generate for correctness modes (which are run in the PR gate).
	 */
	defaultTestCount: number;

	/**
	 * Number of clients to perform operations on at the start of the test.
	 * This does not include the read-only client created for consistency validation
	 * and summarization--see {@link DDSFuzzTestState.summarizerClient}.
	 */
	numberOfClients: number;

	/**
	 * Options dictating if and when to simulate new clients joining the collaboration session.
	 * If not specified, no new clients will be added after the test starts.
	 *
	 * This option is useful for testing eventual consistency bugs related to summarization.
	 *
	 * @remarks - Even without enabling this option, DDS fuzz models can generate {@link AddClient}
	 * operations with whatever strategy is appropriate.
	 * This is useful for nudging test cases towards a particular pattern of clients joining.
	 */
	clientJoinOptions?: {
		/**
		 * The maximum number of clients that will ever be added to the test.
		 * @remarks - Due to current mock limitations, clients will only ever be added to the collaboration session,
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
	 * Strategy for validating eventual consistency of DDSes.
	 * In random mode, each generated operation has the specified probability to instead be a synchronization point
	 * (all connected clients process all ops) followed by validation that all clients agree on their shared state.
	 * In fixed interval mode, this synchronization happens on a predictable cadence: every `interval` operations
	 * generated.
	 */
	validationStrategy:
		| { type: "random"; probability: number }
		| { type: "fixedInterval"; interval: number };
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
	 * @example
	 * ```typescript
	 * // Runs only seed 42 for the given model.
	 * createDDSFuzzSuite(model, { only: [42] });
	 * ```
	 * @remarks
	 * If you prefer, a variant of the standard `.only` syntax works. See {@link createDDSFuzzSuite.only}
	 */
	only: Iterable<number>;

	/**
	 * Whether failure files should be saved to disk, and if so, the directory in which they should be saved.
	 * Each seed will be saved in a subfolder of this directory obtained by kebab-casing the model name.
	 *
	 * Turning on this feature is encouraged for quick minimization.
	 */
	saveFailures: false | { directory: string };
}

const defaultDDSFuzzSuiteOptions: DDSFuzzSuiteOptions = {
	defaultTestCount: defaultOptions.defaultTestCount,
	numberOfClients: 3,
	only: [],
	parseOperations: (serialized: string) => JSON.parse(serialized) as BaseOperation[],
	reconnectProbability: 0,
	saveFailures: false,
	validationStrategy: { type: "random", probability: 0.05 },
};

function mixinNewClient<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory>,
>(
	model: DDSFuzzModel<TChannelFactory, TOperation, TState>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzModel<TChannelFactory, TOperation | AddClient, TState> {
	const isClientAddOp = (op: TOperation | AddClient): op is AddClient => op.type === "addClient";

	const generatorFactory: () => Generator<TOperation | AddClient, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | AddClient | typeof done> => {
			const baseOp = baseGenerator(state);
			const { clients, random } = state;
			if (
				options.clientJoinOptions !== undefined &&
				clients.length < options.clientJoinOptions.maxNumberOfClients &&
				random.bool(options.clientJoinOptions.clientAddProbability)
			) {
				return {
					type: "addClient",
					addedClientId: makeFriendlyClientId(random, clients.length),
				};
			}
			return baseOp;
		};
	};

	const reducer: Reducer<TOperation | AddClient, TState> = async (state, op) => {
		if (isClientAddOp(op)) {
			const newClient = await loadClient(
				state.containerRuntimeFactory,
				state.summarizerClient,
				model.factory,
				op.addedClientId,
			);
			state.clients.push(newClient);
			return state;
		}
		return model.reducer(state, op);
	};

	return {
		...model,
		generatorFactory,
		reducer,
	};
}

function mixinReconnect<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory>,
>(
	model: DDSFuzzModel<TChannelFactory, TOperation, TState>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzModel<TChannelFactory, TOperation | ChangeConnectionState, TState> {
	const generatorFactory: () => Generator<TOperation | ChangeConnectionState, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | ChangeConnectionState | typeof done> => {
			const baseOp = baseGenerator(state);
			if (state.random.bool(options.reconnectProbability)) {
				const client = state.clients.find((c) => c.channel.id === state.channel.id);
				assert(client !== undefined);
				return {
					type: "changeConnectionState",
					connected: !client.containerRuntime.connected,
				};
			}

			return baseOp;
		};
	};

	const reducer: Reducer<TOperation | ChangeConnectionState, TState> = async (
		state,
		operation,
	) => {
		if (operation.type === "changeConnectionState") {
			state.client.containerRuntime.connected = (
				operation as ChangeConnectionState
			).connected;
			return state;
		} else {
			return model.reducer(state, operation as TOperation);
		}
	};
	return {
		...model,
		generatorFactory,
		reducer,
	};
}

function mixinSynchronization<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory>,
>(
	model: DDSFuzzModel<TChannelFactory, TOperation, TState>,
	options: DDSFuzzSuiteOptions,
): DDSFuzzModel<TChannelFactory, TOperation | Synchronize, TState> {
	const { validationStrategy } = options;
	let generatorFactory: () => Generator<TOperation | Synchronize, TState>;
	switch (validationStrategy.type) {
		case "random":
			// passing 1 here causes infinite loops. passing close to 1 is wasteful
			// as synchronization + eventual consistency validation should be idempotent.
			// 0.5 is arbitrary but there's no reason anyone should want a probability near this.
			assert(
				validationStrategy.probability < 0.5,
				"Use a lower synchronization probability.",
			);
			generatorFactory = (): Generator<TOperation | Synchronize, TState> => {
				const baseGenerator = model.generatorFactory();
				return async (state: TState): Promise<TOperation | Synchronize | typeof done> =>
					state.random.bool(validationStrategy.probability)
						? { type: "synchronize" }
						: baseGenerator(state);
			};
			break;

		case "fixedInterval":
			generatorFactory = (): Generator<TOperation | Synchronize, TState> => {
				const baseGenerator = model.generatorFactory();
				return interleave<TOperation | Synchronize, TState>(
					baseGenerator,
					repeat({ type: "synchronize" } as const),
					validationStrategy.interval,
					1,
					ExitBehavior.OnEitherExhausted,
				);
			};
			break;
		default:
			unreachableCase(validationStrategy);
	}

	const isSynchronizeOp = (op: BaseOperation): op is Synchronize => op.type === "synchronize";
	const reducer: Reducer<TOperation | Synchronize, TState> = async (state, operation) => {
		if (isSynchronizeOp(operation)) {
			state.containerRuntimeFactory.processAllMessages();
			const connectedClients = state.clients.filter(
				(client) => client.containerRuntime.connected,
			);
			if (connectedClients.length > 0) {
				const readonlyChannel = state.summarizerClient.channel;
				for (const { channel } of connectedClients) {
					model.validateConsistency(readonlyChannel, channel);
				}
			}
			return state;
		}
		return model.reducer(state, operation);
	};
	return {
		...model,
		generatorFactory,
		reducer,
	};
}

const isClientSpec = (op: unknown): op is ClientSpec => (op as ClientSpec).clientId !== undefined;

function mixinClientSelection<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory>,
>(
	model: DDSFuzzModel<TChannelFactory, TOperation, TState>,
	_: DDSFuzzSuiteOptions,
): DDSFuzzModel<TChannelFactory, TOperation, TState> {
	const generatorFactory: () => Generator<TOperation, TState> = () => {
		const baseGenerator = model.generatorFactory();
		return async (state): Promise<TOperation | typeof done> => {
			// Pick a channel, and:
			// 1. Make it available for the DDS model generators (so they don't need to
			// do the boilerplate of selecting a client to perform the operation on)
			// 2. Make it available to the subsequent reducer logic we're going to inject
			// (so that we can recover the channel from serialized data)
			const client = state.random.pick(state.clients);
			const baseOp = await baseGenerator({
				...state,
				channel: client.channel,
				client,
			});
			return baseOp === done
				? done
				: {
						...baseOp,
						clientId: client.containerRuntime.clientId,
				  };
		};
	};

	const reducer: Reducer<TOperation | Synchronize, TState> = async (state, operation) => {
		assert(isClientSpec(operation), "operation should have been given a client");
		const client = state.clients.find(
			(c) => c.containerRuntime.clientId === operation.clientId,
		);
		assert(client !== undefined);
		return model.reducer(
			{ ...state, channel: client.channel, client },
			operation as TOperation,
		);
	};
	return {
		...model,
		generatorFactory,
		reducer,
	};
}

function makeUnreachableCodepathProxy<T extends object>(name: string): T {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return new Proxy({} as T, {
		get: (): never => {
			throw new Error(
				`Unexpected read of '${name}:' this indicates a bug in the DDS eventual consistency harness.`,
			);
		},
	});
}

function createClient<TChannelFactory extends IChannelFactory>(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	factory: TChannelFactory,
	clientId: string,
): Client<TChannelFactory> {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId });
	// Note: we re-use the clientId for the channel id here despite connecting all clients to the same channel:
	// this isn't how it would work in a real scenario, but the mocks don't use the channel id for any message
	// routing behavior and making all of the object ids consistent helps with debugging and writing more informative
	// consistency validation.
	const channel: ReturnType<typeof factory.create> = factory.create(dataStoreRuntime, clientId);

	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services: IChannelServices = {
		deltaConnection: containerRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	channel.connect(services);
	// TS resolves the return type of model.factory.create too early and isn't able to retain a more specific type
	// than IChannel here.
	return { containerRuntime, channel: channel as ReturnType<TChannelFactory["create"]> };
}

async function loadClient<TChannelFactory extends IChannelFactory>(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	summarizerClient: Client<TChannelFactory>,
	factory: TChannelFactory,
	clientId: string,
): Promise<Client<TChannelFactory>> {
	const { summary } = summarizerClient.channel.getAttachSummary();
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime, {
		minimumSequenceNumber: containerRuntimeFactory.sequenceNumber,
	});
	const services: IChannelServices = {
		deltaConnection: containerRuntime.createDeltaConnection(),
		objectStorage: MockStorage.createFromSummary(summary),
	};

	const channel = (await factory.load(
		dataStoreRuntime,
		clientId,
		services,
		factory.attributes,
	)) as ReturnType<TChannelFactory["create"]>;
	channel.connect(services);
	const newClient: Client<TChannelFactory> = {
		channel,
		containerRuntime,
	};
	return newClient;
}

/**
 * Gets a friendly ID for a client based on its index in the client list.
 * This exists purely for easier debugging--reasoning about client "A" is easier than reasoning
 * about client "3e8a621a-7b35-414b-897f-8795962fb415".
 */
function makeFriendlyClientId(random: IRandom, index: number): string {
	return index < 26 ? String.fromCodePoint(index + 65) : random.uuid4();
}

function runTest<TChannelFactory extends IChannelFactory, TOperation extends BaseOperation>(
	model: DDSFuzzModel<TChannelFactory, TOperation>,
	options: InternalOptions,
	seed: number,
	saveInfo: SaveInfo | undefined,
): void {
	const itFn = options.only.has(seed) ? it.only : it;
	itFn(`seed ${seed}`, async () => {
		const random = makeRandom(seed);
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const summarizerClient = createClient(containerRuntimeFactory, model.factory, "summarizer");

		const clients = await Promise.all(
			Array.from({ length: options.numberOfClients }, async (_, index) =>
				loadClient(
					containerRuntimeFactory,
					summarizerClient,
					model.factory,
					makeFriendlyClientId(random, index),
				),
			),
		);

		const initialState: DDSFuzzTestState<TChannelFactory> = {
			clients,
			summarizerClient,
			containerRuntimeFactory,
			random,
			// These properties should always be injected into the state by the mixed in reducer/generator
			// for any user code. We initialize them to proxies which throw errors on any property access
			// to catch bugs in that setup.
			channel: makeUnreachableCodepathProxy("channel"),
			client: makeUnreachableCodepathProxy("client"),
		};

		await performFuzzActions(model.generatorFactory(), model.reducer, initialState, saveInfo);
	});
}

type InternalOptions = Omit<DDSFuzzSuiteOptions, "only"> & { only: Set<number> };

function isInternalOptions(options: DDSFuzzSuiteOptions): options is InternalOptions {
	return options.only instanceof Set;
}

/**
 * Creates a suite of eventual consistency tests for a particular DDS model.
 */
export function createDDSFuzzSuite<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
>(
	ddsModel: DDSFuzzModel<TChannelFactory, TOperation>,
	providedOptions?: Partial<DDSFuzzSuiteOptions>,
): void {
	const options = {
		...defaultDDSFuzzSuiteOptions,
		...providedOptions,
	};

	const only = new Set(options.only);
	options.only = only;
	assert(isInternalOptions(options));

	const model = mixinSynchronization(
		mixinNewClient(mixinClientSelection(mixinReconnect(ddsModel, options), options), options),
		options,
	);

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
					// We lose some typesafety here because the options interface isn't generic
					generatorFactory: (): Generator<TOperation, unknown> =>
						generatorFromArray(operations as TOperation[]),
				};
				// eslint-disable-next-line unicorn/no-useless-undefined
				runTest(replayModel, options, seed, undefined);
			});
		}
	});
}

/**
 * Runs only the provided seeds.
 * @example
 * ```typescript
 * // Runs only seed 42 for the given model.
 * createDDSFuzzSuite.only(42)(model);
 * ```
 */
createDDSFuzzSuite.only =
	(...seeds: number[]) =>
	<TChannelFactory extends IChannelFactory, TOperation extends BaseOperation>(
		ddsModel: DDSFuzzModel<TChannelFactory, TOperation>,
		providedOptions?: Partial<DDSFuzzSuiteOptions>,
	): void =>
		createDDSFuzzSuite(ddsModel, {
			...providedOptions,
			only: [...seeds, ...(providedOptions?.only ?? [])],
		});
