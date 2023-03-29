/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { strict as assert } from "assert";
import { LocalServerTestDriver } from "@fluid-internal/test-drivers";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
	IChannelFactory,
	IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { IContainerRuntimeBase, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import {
	createSingleBlobSummary,
	IFluidSerializer,
	SharedObject,
} from "@fluidframework/shared-object-base";
import {
	IPersistedConfigStore,
	createPersistedConfigStore,
	PersistedConfigSchema,
	Version,
	ConfigUpgradeType,
	PersistedFormatConfig,
	PersistedConfigSummary,
} from "../../../feature-libraries/persisted-config";
import {
	AcceptanceCondition,
	AsyncGenerator,
	asyncGeneratorFromArray,
	BaseFuzzTestState,
	createWeightedAsyncGenerator,
	makeRandom,
	performFuzzActions,
	performFuzzActionsAsync,
	takeAsync,
} from "@fluid-internal/stochastic-test-utils";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	ITestFluidObject,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	TestObjectProvider,
} from "@fluidframework/test-utils";
import { Loader } from "@fluidframework/container-loader";
import { IRequest } from "@fluidframework/core-interfaces";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime";
import { IContainer } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

interface CounterFlags {
	/**
	 * The major number of this Version offsets how much ops really intend to increment:
	 * if incrementVersion is 1.0.0, an op which says `incrementAmount: 4` should really increment
	 * 4 + 1 = 5, and if incrementVersion is 6.0.0, an op which says `incrementAmount: -2` should
	 * really increment -2 + 6 = 4.
	 */
	incrementVersion: never;
}

/**
 * Configuration which impacts counter.
 *
 * Write format:
 */
type CounterConfig = PersistedFormatConfig<keyof CounterFlags>;

class CounterFactory implements IChannelFactory {
	public static readonly Type = "TestCounter";

	public static readonly Attributes: IChannelAttributes = {
		type: CounterFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: "1.0.0",
	};

	public constructor(public readonly config: CounterConfig) {}

	public get type(): string {
		return CounterFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return CounterFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedCounter> {
		const counter = new SharedCounter(this.config, id, runtime, attributes);
		await counter.load(services);
		return counter;
	}

	public create(document: IFluidDataStoreRuntime, id: string): SharedCounter {
		const counter = new SharedCounter(this.config, id, document, this.attributes);
		counter.initializeLocal();
		return counter;
	}
}

/**
 * Describes the operation (op) format for incrementing the {@link SharedCounter}.
 */
interface IIncrementOperation {
	type: "increment";
	incrementAmount: number;
	// Note: this is only plumbed through for assertion purposes. A typical DDS wouldn't need to include this
	// on their op.
	formatVersion: Version;
}

interface CounterLocalOpMetadata {
	config: CounterConfig;
}

/**
 * @remarks Used in snapshotting.
 */
interface ICounterSnapshotFormat {
	/**
	 * The value of the counter.
	 */
	value: number;
	config: PersistedConfigSummary;
}

const unimplemented = () => assert.fail("not implemented");

// TODO: make this parameterizable for different fuzz test cases.
const schema: PersistedConfigSchema<keyof CounterFlags> = {
	formatVersion: () => ConfigUpgradeType.ConcurrentOpsValid,
	flags: {
		incrementVersion: () => ConfigUpgradeType.ConcurrentOpsValid,
	},
};

// A pared-down version of SharedCounter which leverages persisted configuration.
// This DDS is used to
class SharedCounter extends SharedObject {
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedCounter {
		return runtime.createChannel(id, CounterFactory.Type) as SharedCounter;
	}

	private readonly configStore: IPersistedConfigStore<keyof CounterFlags>;

	public constructor(
		config: CounterConfig,
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_counter_");
		const onProtocolChange = () => {};
		const reSubmitPendingOps = unimplemented;
		this.configStore = createPersistedConfigStore(
			schema,
			config,
			(content, localOpMetadata) => this.submitLocalMessage(content, localOpMetadata),
			onProtocolChange,
			reSubmitPendingOps,
		);
	}

	public static getFactory(config: CounterConfig): IChannelFactory {
		return new CounterFactory(config);
	}

	public value: number = 0;

	/**
	 * {@inheritDoc ISharedCounter.increment}
	 */
	public increment(incrementAmount: number): void {
		const config = this.configStore.getConfigForNextSubmission();
		const op: IIncrementOperation = {
			type: "increment",
			incrementAmount: incrementAmount - this.incrementOffsetFromOpConfig(config),
			formatVersion: config.formatVersion,
		};

		this.incrementCore(incrementAmount);
		this.configStore.submit(op, { config });
	}

	private incrementOffsetFromOpConfig(config: CounterConfig): number {
		return parseVersion(config.flags.incrementVersion).major;
	}

	private incrementCore(incrementAmount: number): void {
		this.value += incrementAmount;
	}

	protected onDisconnect() {}

	/**
	 * Create a summary for the counter.
	 *
	 * @returns The summary of the current state of the counter.
	 *
	 * @internal
	 */
	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		// Get a serializable form of data
		const content: ICounterSnapshotFormat = {
			value: this.value,
			config: this.configStore.summarize(),
		};

		// And then construct the summary for it
		return createSingleBlobSummary("contents", JSON.stringify(content));
	}

	protected reSubmitCore(content: any, metadata: CounterLocalOpMetadata): void {
		const configForNextSubmission = this.configStore.getConfigForNextSubmission();
		if (configForNextSubmission.configVersion === metadata.config.configVersion) {
			this.configStore.submit(content, metadata);
		} else {
			const isIncrementOp = (op: any): op is IIncrementOperation => op.type === "increment";
			if (isIncrementOp(content)) {
				const rebasedOp: IIncrementOperation = {
					type: "increment",
					incrementAmount:
						content.incrementAmount +
						this.incrementOffsetFromOpConfig(metadata.config) -
						this.incrementOffsetFromOpConfig(configForNextSubmission),
					formatVersion: configForNextSubmission.formatVersion,
				};
				this.configStore.submit(rebasedOp, { config: configForNextSubmission });
			} else {
				// could do this in case 1 above too
				super.reSubmitCore(content, metadata);
			}
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 *
	 * @internal
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<ICounterSnapshotFormat>(storage, "contents");

		this.configStore.loadCore(content.config);
		this.value = content.value;
	}

	public verifyNoMismatchedFormats(): void {
		assert(this.mismatchedVersions.length === 0, "Mismatched format versions");
	}

	private mismatchedVersions: ISequencedDocumentMessage[] = [];
	private checkForMismatchedMessage(message: ISequencedDocumentMessage) {
		// Note: throwing an error as part of op processing doesn't surface to the test very nicely due to
		// runtime-level error handling and translation. Storing the mismatch and throwing later still allows
		// easy enough debugging of what went wrong (breakpoing in this function) while making the error clear.
		const config = this.configStore.getConfigForMessage(message);
		if (config.formatVersion !== message.contents.formatVersion) {
			this.mismatchedVersions.push(message);
		}
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		if (this.configStore.tryProcessOp(message, local, localOpMetadata)) {
			return;
		}

		this.checkForMismatchedMessage(message);
		const config = this.configStore.getConfigForMessage(message);

		if (message.type === MessageType.Operation && !local) {
			const op = message.contents as IIncrementOperation;

			switch (op.type) {
				case "increment":
					this.incrementCore(
						op.incrementAmount + this.incrementOffsetFromOpConfig(config),
					);
					break;

				default:
					throw new Error("Unknown operation");
			}
		}
	}

	protected applyStashedOp(op: unknown): void {
		const counterOp = op as IIncrementOperation;

		// TODO: Clean up error code linter violations repo-wide.
		// eslint-disable-next-line unicorn/numeric-separators-style
		assert(counterOp.type === "increment", "Op type is not increment");
		this.incrementCore(counterOp.incrementAmount);
	}
}

function parseVersion(version: Version): Semver {
	const isInternal = version.endsWith("-internal");
	assert(!isInternal, "TODO: Handle internal semvers.");
	const versions = version.split(".");
	assert(versions.length === 3, "invalid version string");
	const major = Number.parseInt(versions[0]);
	const minor = Number.parseInt(versions[1]);
	const patch = Number.parseInt(versions[2]);
	return {
		major,
		minor,
		patch,
		isInternal,
	};
}

interface Semver {
	major: number;
	minor: number;
	patch: number;
	isInternal: boolean;
}

interface Join {
	type: "join";
	config: PersistedFormatConfig;
}

interface Leave {
	type: "leave";
	client: number /* index */;
}

interface Synchronize {
	type: "synchronize";
}

interface Increment {
	type: "increment";
	amount: number;
	client: number /* index */;
}

type Operation = Join | Leave | Increment | Synchronize;

interface State extends BaseFuzzTestState {
	currentMaxConfigVersion: number;
	testObjectProvider: TestObjectProvider;
	clients: { container: IContainer; counter: SharedCounter }[];
}

interface GeneratorOptions {}

function makeGenerator(options?: GeneratorOptions): AsyncGenerator<Operation, State> {
	// since all configurations with the same configVersion must align exactly,
	const deployedConfigs: Map<number, CounterConfig> = new Map<number, CounterConfig>();
	const join: AsyncGenerator<Join, State> = async ({ random, currentMaxConfigVersion }) => {
		const configVersion = random.integer(1, currentMaxConfigVersion + 2);
		const config = deployedConfigs.get(configVersion) ?? {
			configVersion,
			formatVersion: `${random.integer(1, 10)}.0.0`,
			flags: {
				incrementVersion: `${random.integer(1, 20)}.0.0`,
			},
		};
		deployedConfigs.set(configVersion, config);
		return {
			type: "join",
			config,
		};
	};

	const leave: AsyncGenerator<Leave, State> = async ({ random, clients }) => {
		return {
			type: "leave",
			client: random.integer(0, clients.length - 1),
		};
	};

	const increment: AsyncGenerator<Increment, State> = async ({ random, clients }) => {
		return {
			type: "increment",
			amount: random.integer(-20, 20),
			client: random.integer(0, clients.length - 1),
		};
	};

	const atLeastOneClient: AcceptanceCondition<State> = (state) => state.clients.length > 0;

	return createWeightedAsyncGenerator<Operation, State>([
		[{ type: "synchronize" }, 1, atLeastOneClient],
		[increment, 5, atLeastOneClient],
		[join, 1],
		[leave, 1, atLeastOneClient],
	]);
}

const directory = resolve(
	__dirname,
	"../../../../src/test/feature-libraries/persisted-config/seeds",
);
function runFuzzTestCase(seed: number, generator: AsyncGenerator<Operation, State>): void {
	it(`seed ${seed}`, async () => {
		const random = makeRandom(seed);
		const driver = new LocalServerTestDriver();
		const createFluidEntrypoint = (testContainerConfig?: ITestContainerConfig) => {
			const counterConfig = testContainerConfig?.loaderProps?.options?.counterConfig ?? {
				configVersion: 0,
				formatVersion: "1.0.0",
				flags: {
					incrementVersion: "0.0.0",
				},
			};
			const registry: ChannelFactoryRegistry = [
				[CounterFactory.Type, new CounterFactory(counterConfig)],
			];
			return new TestContainerRuntimeFactory(
				"@fluid-example/test-dataStore",
				new TestFluidObjectFactory(registry),
				{
					summaryOptions: {
						summaryConfigOverrides: {
							...DefaultSummaryConfiguration,
							...{
								minIdleTime: Number.MAX_SAFE_INTEGER,
								maxIdleTime: Number.MAX_SAFE_INTEGER,
								maxTime: Number.MAX_SAFE_INTEGER,
								initialSummarizerDelayMs: 0,
								maxOps: 20,
							},
						},
					},
				},
			);
		};

		const testObjectProvider = new TestObjectProvider(Loader, driver, createFluidEntrypoint);
		const initialContainer = await testObjectProvider.makeTestContainer();

		const counterFromContainer = async (container: IContainer): Promise<SharedCounter> => {
			const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
			const counter = await dataObject.getSharedObject<SharedCounter>(CounterFactory.Type);
			assert(counter !== undefined);
			return counter;
		};

		const initialState: State = {
			clients: [
				{
					container: initialContainer,
					counter: await counterFromContainer(initialContainer),
				},
			],
			currentMaxConfigVersion: 0,
			random,
			testObjectProvider,
		};

		const assertConsistent = (state: State): void => {
			for (const { counter } of state.clients) {
				counter.verifyNoMismatchedFormats();
			}

			if (state.clients.length > 2) {
				const client0Count = state.clients[0].counter.value;
				for (const client of state.clients) {
					assert.equal(client.counter.value, client0Count);
				}
			}
		};

		const finalState = await performFuzzActionsAsync<Operation, State>(
			generator,
			{
				join: async (state, operation) => {
					const container = await state.testObjectProvider.loadTestContainer({
						loaderProps: { options: { counterConfig: operation.config } },
					});
					const counter = await counterFromContainer(container);
					state.currentMaxConfigVersion = Math.max(
						state.currentMaxConfigVersion,
						operation.config.configVersion,
					);
					state.clients.push({ counter, container });
				},
				leave: async (state, operation) => {
					const { container } = state.clients[operation.client];
					container.close();
					state.clients.splice(operation.client, 1);
				},
				increment: async (state, { amount, client }) => {
					const { counter } = state.clients[client];
					counter.increment(amount);
				},
				synchronize: async (state) => {
					await state.testObjectProvider.ensureSynchronized();
					assertConsistent(state);
				},
			},
			initialState,
			{ saveOnFailure: true, filepath: join(directory, `${seed}.json`) },
		);

		await testObjectProvider.ensureSynchronized();
		assertConsistent(finalState);
	});
}

const testCount = 100;

describe.only("Persisted Config Fuzz", () => {
	before(() => {
		if (!existsSync(directory)) {
			mkdirSync(directory, { recursive: true });
		}
	});

	for (let seed = 0; seed < testCount; seed++) {
		runFuzzTestCase(seed, takeAsync(100, makeGenerator()));
	}

	describe.only(`replay seed from file`, () => {
		const seed = 47;
		const filepath = join(directory, `${seed}.json`);
		const operations: Operation[] = JSON.parse(readFileSync(filepath).toString());
		const generator = asyncGeneratorFromArray(operations);
		runFuzzTestCase(seed, generator);
	});
});
