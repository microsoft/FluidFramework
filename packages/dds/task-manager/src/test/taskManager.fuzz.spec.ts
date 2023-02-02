/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { strict as assert } from "assert";
import {
	BaseFuzzTestState,
	createFuzzDescribe,
	createWeightedGenerator,
	Generator,
	generatorFromArray,
	interleave,
	makeRandom,
	performFuzzActions,
	Reducer,
	SaveInfo,
	take,
} from "@fluid-internal/stochastic-test-utils";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
} from "@fluidframework/test-runtime-utils";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import { TaskManager } from "../taskManager";
import { TaskManagerFactory } from "../taskManagerFactory";

interface Client {
	taskManager: TaskManager;
	containerRuntime: MockContainerRuntimeForReconnection;
}

interface FuzzTestState extends BaseFuzzTestState {
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
	clients: Client[];
	taskIdPool: string[];
}

interface ClientSpec {
	clientId: string;
	taskManagerName: string;
}

interface Volunteer extends ClientSpec {
	type: "volunteer";
	taskId: string;
}

interface Abandon extends ClientSpec {
	type: "abandon";
	taskId: string;
}

interface Subscribe extends ClientSpec {
	type: "subscribe";
	taskId: string;
}

interface Complete extends ClientSpec {
	type: "complete";
	taskId: string;
}

interface ChangeConnectionState extends ClientSpec {
	type: "changeConnectionState";
	connected: boolean;
}

interface Synchronize {
	type: "synchronize";
}

type TaskOperation = Volunteer | Abandon | Subscribe | Complete;

type ClientOperation = TaskOperation | ChangeConnectionState;

type Operation = ClientOperation | Synchronize;

interface OperationGenerationConfig {
	/**
	 * Number of task ids to be generated
	 */
	taskPoolSize?: number;
	/**
	 * Length of taskId strings
	 */
	taskStringLength?: number;
	/**
	 * Number of ops in between each synchronization/validation of the TaskManagers
	 */
	validateInterval?: number;
	/**
	 * Number of tests to generate
	 */
	testCount?: number;
	/**
	 * Number of operations to perform in each test
	 */
	operations?: number;
}

const defaultOptions: Required<OperationGenerationConfig> = {
	taskPoolSize: 3,
	taskStringLength: 5,
	validateInterval: 10,
	testCount: 10,
	operations: 100,
};

function makeOperationGenerator(
	optionsParam?: OperationGenerationConfig,
): Generator<Operation, FuzzTestState> {
	const options = { ...defaultOptions, ...(optionsParam ?? {}) };
	type ClientOpState = FuzzTestState & {
		taskManager: TaskManager;
		taskId: string;
		clientId: string;
	};

	function volunteer(state: ClientOpState): Volunteer {
		return {
			type: "volunteer",
			taskId: state.taskId,
			clientId: state.clientId,
			taskManagerName: state.taskManager.id,
		};
	}

	function abandon(state: ClientOpState): Abandon {
		return {
			type: "abandon",
			taskId: state.taskId,
			clientId: state.clientId,
			taskManagerName: state.taskManager.id,
		};
	}

	function subscribe(state: ClientOpState): Subscribe {
		return {
			type: "subscribe",
			taskId: state.taskId,
			clientId: state.clientId,
			taskManagerName: state.taskManager.id,
		};
	}

	function complete(state: ClientOpState): Complete {
		return {
			type: "complete",
			taskId: state.taskId,
			clientId: state.clientId,
			taskManagerName: state.taskManager.id,
		};
	}

	function changeConnectionState(state: ClientOpState): ChangeConnectionState {
		const clientId = state.clientId;
		const containerRuntime = findRuntime(state.clients, clientId);
		return {
			type: "changeConnectionState",
			clientId,
			// No-ops aren't interesting; always make this flip the connection state.
			connected: containerRuntime?.connected ? false : true,
			taskManagerName: state.taskManager.id,
		};
	}

	const isConnected = ({ taskManager }: ClientOpState): boolean => taskManager.connected;
	const isQueued = ({ taskManager, taskId }: ClientOpState): boolean =>
		taskManager.queued(taskId);
	const isAssigned = ({ taskManager, taskId }: ClientOpState): boolean =>
		taskManager.assigned(taskId);

	const clientBaseOperationGenerator = createWeightedGenerator<Operation, ClientOpState>([
		[volunteer, 1, isConnected],
		[abandon, 1, isQueued],
		[subscribe, 1],
		[complete, 1, isAssigned],
		[changeConnectionState, 1],
	]);

	const clientOperationGenerator = (state: FuzzTestState) => {
		const client = state.random.pick(state.clients);
		return clientBaseOperationGenerator({
			...state,
			taskManager: client.taskManager,
			taskId: state.random.pick(state.taskIdPool),
			clientId: client.containerRuntime.clientId,
		});
	};

	return interleave(
		clientOperationGenerator,
		() => ({ type: "synchronize" }),
		options.validateInterval,
	);
}

interface LoggingInfo {
	/** ids of the Task Managers to track over time */
	taskManagerNames: string[];
	/** ids of tasks to track over time */
	taskId: string;
}

function findTaskManager(clients: Client[], taskManagerName: string): TaskManager {
	const { taskManager } =
		clients.find((client) => {
			return client.taskManager.id === taskManagerName;
		}) ?? {};
	return taskManager as TaskManager;
}

function findRuntime(
	clients: Client[],
	taskManagerName: string,
): MockContainerRuntimeForReconnection {
	const { containerRuntime } =
		clients.find((client) => {
			return client.taskManager.id === taskManagerName;
		}) ?? {};
	return containerRuntime as MockContainerRuntimeForReconnection;
}

function logCurrentState(state: FuzzTestState, loggingInfo: LoggingInfo): void {
	for (const client of state.clients) {
		const taskManager = client.taskManager;
		assert(taskManager);
		if (loggingInfo.taskManagerNames.includes(taskManager.id)) {
			console.log(`TaskManager ${taskManager.id} (Connected: ${taskManager.connected}):`);
			console.log((taskManager as any).taskQueues.get(loggingInfo.taskId));
			console.log("\n");
		}
	}
}

function assertEqualQueues(queue1: Map<string, string[]>, queue2: Map<string, string[]>) {
	assert(queue1.size === queue2.size, "The number of tasks queues are not the same");
	for (const [key, val] of queue1) {
		const testVal = queue2.get(key);
		if (testVal === undefined) {
			assert(val === undefined, "Task queues are not both undefined");
			return;
		}
		assert(testVal.length === val.length, "Task queues are not the same size");
		if (testVal.length > 0) {
			testVal.forEach((task: string, index: number) => {
				assert(task === val[index], `Task queues are not identical`);
			});
		}
	}
}

function assertConsistent(clients: Client[]) {
	const connectedClients = clients.filter((client) => client.containerRuntime.connected);
	if (connectedClients.length < 2) {
		return;
	}
	const first = connectedClients[0].taskManager;
	for (const { taskManager: other } of connectedClients.slice(1)) {
		assertEqualQueues((first as any).taskQueues, (other as any).taskQueues);
	}
}

function runTaskManagerFuzz(
	generator: Generator<Operation, FuzzTestState>,
	initialState: FuzzTestState,
	saveInfo?: SaveInfo,
	loggingInfo?: LoggingInfo,
): void {
	// Small wrapper to avoid having to return the same state repeatedly; all operations in this suite mutate.
	// Also a reasonable point to inject logging of incremental state.
	const statefully =
		<T>(
			statefulReducer: (state: FuzzTestState, operation: T) => void,
		): Reducer<T, FuzzTestState> =>
		(state, operation) => {
			if (loggingInfo !== undefined && (operation as any).taskId === loggingInfo.taskId) {
				logCurrentState(state, loggingInfo);
				console.log("-".repeat(20));
				console.log("Next operation:", JSON.stringify(operation, undefined, 4));
			}
			statefulReducer(state, operation);
			return state;
		};

	performFuzzActions(
		generator,
		{
			volunteer: statefully(({ clients }, { taskManagerName, taskId }) => {
				const taskManager = findTaskManager(clients, taskManagerName);
				assert(taskManager);
				taskManager.volunteerForTask(taskId).catch((e: Error) => {
					// We expect an error to be thrown if we are disconnected while volunteering
					const expectedErrors = [
						"Disconnected before acquiring task assignment",
						"Abandoned before acquiring task assignment",
					];
					if (!expectedErrors.includes(e.message)) {
						throw e;
					}
				});
			}),
			abandon: statefully(({ clients }, { taskManagerName, taskId }) => {
				const taskManager = findTaskManager(clients, taskManagerName);
				assert(taskManager);
				taskManager.abandon(taskId);
			}),
			subscribe: statefully(({ clients }, { taskManagerName, taskId }) => {
				const taskManager = findTaskManager(clients, taskManagerName);
				assert(taskManager);
				taskManager.subscribeToTask(taskId);
			}),
			complete: statefully(({ clients }, { taskManagerName, taskId }) => {
				const taskManager = findTaskManager(clients, taskManagerName);
				assert(taskManager);
				taskManager.complete(taskId);
			}),
			synchronize: statefully(({ containerRuntimeFactory, clients }) => {
				containerRuntimeFactory.processAllMessages();
				assertConsistent(clients);
			}),
			changeConnectionState: statefully(({ clients }, { taskManagerName, connected }) => {
				const containerRuntime = findRuntime(clients, taskManagerName);
				assert(containerRuntime);
				containerRuntime.connected = connected;
			}),
		},
		initialState,
		saveInfo,
	);
}

const directory = path.join(__dirname, "../../src/test/results");

function getPath(seed: number): string {
	return path.join(directory, `${seed}.json`);
}

const describeFuzz = createFuzzDescribe({ defaultTestCount: defaultOptions.testCount });

describeFuzz("TaskManager fuzz testing", ({ testCount }) => {
	before(() => {
		if (!existsSync(directory)) {
			mkdirSync(directory, { recursive: true });
		}
	});

	function runTests(
		seed: number,
		generator: Generator<Operation, FuzzTestState>,
		loggingInfo?: LoggingInfo,
	): void {
		it(`with default config, seed ${seed}`, async () => {
			const numClients = 3;

			const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
			const clients = Array.from({ length: numClients }, (_, index) => {
				const dataStoreRuntime = new MockFluidDataStoreRuntime();
				const containerRuntime =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
				const services: IChannelServices = {
					deltaConnection: containerRuntime.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};
				const taskManager = new TaskManager(
					`taskManager${index}`,
					dataStoreRuntime,
					TaskManagerFactory.Attributes,
				);
				taskManager.initializeLocal();
				taskManager.connect(services);
				return { containerRuntime, taskManager };
			});

			const random = makeRandom(seed);

			const taskIdPool = Array.from({ length: defaultOptions.taskPoolSize }, () =>
				random.string(defaultOptions.taskStringLength),
			);

			const initialState: FuzzTestState = {
				containerRuntimeFactory,
				clients,
				taskIdPool,
				random,
			};

			runTaskManagerFuzz(
				generator,
				initialState,
				{ saveOnFailure: true, filepath: getPath(seed) },
				loggingInfo,
			);
		});
	}

	function replayTestFromFailureFile(seed: number, loggingInfo?: LoggingInfo) {
		const filepath = getPath(seed);
		let operations: Operation[];
		try {
			operations = JSON.parse(readFileSync(filepath).toString());
		} catch (err: any) {
			// Mocha executes skipped suite creation blocks, but whoever's running this suite only cares if
			// the containing block isn't skipped. Report the original error to them from inside a test.
			if (err.message.includes("ENOENT") === true) {
				it(`with default config, seed ${seed}`, () => {
					throw err;
				});
				return;
			}
			throw err;
		}

		const generator = generatorFromArray(operations);
		runTests(seed, generator, loggingInfo);
	}

	for (let i = 0; i < testCount; i++) {
		const generator = take(
			defaultOptions.operations,
			makeOperationGenerator({ validateInterval: defaultOptions.validateInterval }),
		);
		runTests(i, generator);
	}

	// Change this seed and unskip the block to replay the actions from JSON on disk.
	// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	describe.skip("replay specific seed", () => {
		const seedToReplay = 0;
		replayTestFromFailureFile(
			seedToReplay,
			// The following line can be uncommented for useful logging output which tracks the provided
			// Task managers over time for a specific taskId.
			// { taskManagerNames: ["taskManager0", "taskManager1", "taskManager2"], taskId: "" },
		);
	});
});
