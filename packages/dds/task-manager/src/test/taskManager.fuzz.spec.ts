/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { strict as assert } from "assert";
import {
	combineReducersAsync as combineReducers,
	createWeightedAsyncGenerator as createWeightedGenerator,
	AsyncGenerator as Generator,
	makeRandom,
	AsyncReducer as Reducer,
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import { createDDSFuzzSuite, DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { TaskManagerFactory } from "../taskManagerFactory.js";
import { ITaskManager } from "../interfaces.js";
import { _dirname } from "./dirname.cjs";

type FuzzTestState = DDSFuzzTestState<TaskManagerFactory>;

interface TaskOperation {
	/** The Id of the task that the operation applies to. */
	taskId: string;
}

interface Volunteer extends TaskOperation {
	type: "volunteer";
}

interface Abandon extends TaskOperation {
	type: "abandon";
}

interface Subscribe extends TaskOperation {
	type: "subscribe";
}

interface Complete extends TaskOperation {
	type: "complete";
}

type Operation = Volunteer | Abandon | Subscribe | Complete;

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
	type OpSelectionState = FuzzTestState & {
		taskId: string;
	};

	const taskIdPoolRandom = makeRandom(0);
	const dedupe = <T>(arr: T[]): T[] => Array.from(new Set(arr));
	const taskIdPool = dedupe(
		Array.from({ length: options.taskPoolSize }, () =>
			taskIdPoolRandom.string(defaultOptions.taskStringLength),
		),
	);

	async function volunteer(state: OpSelectionState): Promise<Volunteer> {
		return {
			type: "volunteer",
			taskId: state.taskId,
		};
	}

	async function abandon(state: OpSelectionState): Promise<Abandon> {
		return {
			type: "abandon",
			taskId: state.taskId,
		};
	}

	async function subscribe(state: OpSelectionState): Promise<Subscribe> {
		return {
			type: "subscribe",
			taskId: state.taskId,
		};
	}

	async function complete(state: OpSelectionState): Promise<Complete> {
		return {
			type: "complete",
			taskId: state.taskId,
		};
	}

	const canVolunteer = ({ client }: OpSelectionState): boolean => client.channel.canVolunteer();
	const isQueued = ({ client, taskId }: OpSelectionState): boolean =>
		client.channel.queued(taskId);
	const isAssigned = ({ client, taskId }: OpSelectionState): boolean =>
		client.channel.assigned(taskId);

	const clientBaseOperationGenerator = createWeightedGenerator<Operation, OpSelectionState>([
		[volunteer, 1, canVolunteer],
		[abandon, 1, isQueued],
		[subscribe, 1],
		[complete, 1, isAssigned],
	]);

	return async (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
			taskId: state.random.pick(taskIdPool),
		});
}

interface LoggingInfo {
	/** ids of the Task Managers to track over time */
	taskManagerNames: string[];
	/** ids of tasks to track over time */
	taskId: string;
}

function logCurrentState(state: FuzzTestState, loggingInfo: LoggingInfo): void {
	for (const client of state.clients) {
		const taskManager = client.channel;
		assert(taskManager);
		if (loggingInfo.taskManagerNames.includes(client.containerRuntime.clientId)) {
			console.log(
				`TaskManager ${taskManager.id} (CanVolunteer: ${taskManager.canVolunteer()}):`,
			);
			console.log((taskManager as any).taskQueues.get(loggingInfo.taskId));
			console.log("\n");
		}
	}
}

function makeReducer(loggingInfo?: LoggingInfo): Reducer<Operation, FuzzTestState> {
	const withLogging =
		<T>(baseReducer: Reducer<T, FuzzTestState>): Reducer<T, FuzzTestState> =>
		async (state, operation) => {
			if (loggingInfo !== undefined && (operation as any).taskId === loggingInfo.taskId) {
				logCurrentState(state, loggingInfo);
				console.log("-".repeat(20));
				console.log("Next operation:", JSON.stringify(operation, undefined, 4));
			}
			await baseReducer(state, operation);
		};

	const reducer = combineReducers<Operation, FuzzTestState>({
		volunteer: async ({ client }, { taskId }) => {
			// Note: this is fire-and-forget as `volunteerForTask` resolves/rejects its returned
			// promise based on server responses, which will occur on later operations (and
			// processing those operations will raise the error directly)
			client.channel.volunteerForTask(taskId).catch((e: Error) => {
				// We expect an error to be thrown if we are disconnected while volunteering
				const expectedErrors = [
					"Disconnected before acquiring task assignment",
					"Abandoned before acquiring task assignment",
				];
				if (!expectedErrors.includes(e.message)) {
					throw e;
				}
			});
		},
		abandon: async ({ client }, { taskId }) => {
			client.channel.abandon(taskId);
		},
		subscribe: async ({ client }, { taskId }) => {
			client.channel.subscribeToTask(taskId);
		},
		complete: async ({ client }, { taskId }) => {
			client.channel.complete(taskId);
		},
	});

	return withLogging(reducer);
}

function assertEqualTaskManagers(a: ITaskManager, b: ITaskManager) {
	const queue1 = (a as any).taskQueues;
	const queue2 = (b as any).taskQueues;
	assert.strictEqual(queue1.size, queue2.size, "The number of tasks queues are not the same");
	for (const [key, val] of queue1) {
		const testVal = queue2.get(key);
		if (testVal === undefined) {
			assert(val === undefined, "Task queues are not both undefined");
			continue;
		}
		assert.strictEqual(testVal.length, val.length, "Task queues are not the same size");
		if (testVal.length > 0) {
			testVal.forEach((task: string, index: number) => {
				assert.strictEqual(task, val[index], `Task queues are not identical`);
			});
		}
	}
}

describe("TaskManager fuzz testing", () => {
	const model: DDSFuzzModel<TaskManagerFactory, Operation, FuzzTestState> = {
		workloadName: "default configuration",
		generatorFactory: () => take(100, makeOperationGenerator()),
		reducer:
			// makeReducer supports a param for logging output which tracks the provided intervalId over time:
			// { taskManagerNames: ["A", "B", "C"], taskId: "" },
			makeReducer(),
		validateConsistency: assertEqualTaskManagers,
		factory: new TaskManagerFactory(),
	};

	createDDSFuzzSuite(model, {
		validationStrategy: { type: "fixedInterval", interval: defaultOptions.validateInterval },
		// AB#3985: TaskManager has some eventual consistency issue with reconnect enabled.
		// To make this configuration similar to pre-generic DDS fuzz harness refactor, this constant
		// should be 0.2.
		// Leaving the tests enabled without reconnect on mimics previous behavior (and provides more coverage
		// than skipping them)
		reconnectProbability: 0,
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
			// similar to reconnect there are eventual consistency errors when we enter attaching before rehydrate
			// when fixed, detachedStartOptions can be removed from this config, and attachingBeforeRehydrateDisable
			// can be completely removed, as it is only used by this test. Rather than file more bugs. I'll just combine
			// this with AB#3985, as it looks like the dds has fundamental issue around lifecycle handling
			attachingBeforeRehydrateDisable: true,
		},
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.05,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: defaultOptions.testCount,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
		// Uncomment this line to replay a specific seed:
		// replay: 0,
		// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	});
});

describe("TaskManager fuzz testing with rebasing", () => {
	const model: DDSFuzzModel<TaskManagerFactory, Operation, FuzzTestState> = {
		workloadName: "default configuration and rebasing",
		generatorFactory: () => take(100, makeOperationGenerator()),
		reducer:
			// makeReducer supports a param for logging output which tracks the provided intervalId over time:
			// { taskManagerNames: ["A", "B", "C"], taskId: "" },
			makeReducer(),
		validateConsistency: assertEqualTaskManagers,
		factory: new TaskManagerFactory(),
	};

	createDDSFuzzSuite(model, {
		validationStrategy: { type: "fixedInterval", interval: defaultOptions.validateInterval },
		// AB#5185: enabling rebasing indicates some unknown eventual consistency issue
		skip: [5, 7],
		rebaseProbability: 0.15,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.05,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: defaultOptions.testCount,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
		// AB#5341: enabling 'start from detached' within the fuzz harness demonstrates eventual consistency failures.
		detachedStartOptions: {
			numOpsBeforeAttach: 0,
		},
		// Uncomment this line to replay a specific seed:
		// replay: 0,
		// This can be useful for quickly minimizing failure json while attempting to root-cause a failure.
	});
});
