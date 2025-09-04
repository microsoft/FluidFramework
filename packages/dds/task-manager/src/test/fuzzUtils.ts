/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	AsyncGenerator as Generator,
	Reducer,
} from "@fluid-private/stochastic-test-utils";
import {
	combineReducers,
	createWeightedAsyncGenerator as createWeightedGenerator,
	makeRandom,
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";

import type { ITaskManager } from "../interfaces.js";
import { TaskManagerFactory } from "../taskManagerFactory.js";

/**
 * Default options for TaskManager fuzz testing
 */
export const defaultOptions: Required<OperationGenerationConfig> = {
	taskPoolSize: 3,
	taskStringLength: 5,
	validateInterval: 10,
	testCount: 100,
	operations: 100,
};

type FuzzTestState = DDSFuzzTestState<TaskManagerFactory>;

interface TaskOperation {
	/**
	 * The Id of the task that the operation applies to.
	 */
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

/**
 * TaskManager operation type
 */
type Operation = Volunteer | Abandon | Subscribe | Complete;

/**
 * Config options for generating TaskManager operations
 */
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

function makeOperationGenerator(
	optionsParam?: OperationGenerationConfig,
): Generator<Operation, FuzzTestState> {
	const options = { ...defaultOptions, ...optionsParam };
	type OpSelectionState = FuzzTestState & {
		taskId: string;
	};

	const taskIdPoolRandom = makeRandom(0);
	const dedupe = <T>(arr: T[]): T[] => [...new Set(arr)];
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

	const canVolunteer = ({ client }: OpSelectionState): boolean =>
		client.channel.canVolunteer();
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
	/**
	 * ids of the Task Managers to track over time
	 */
	taskManagerNames: string[];
	/**
	 * ids of tasks to track over time
	 */
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
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
			console.log((taskManager as any).taskQueues.get(loggingInfo.taskId));
			console.log("\n");
		}
	}
}

function makeReducer(loggingInfo?: LoggingInfo): Reducer<Operation, FuzzTestState> {
	const withLogging =
		<T>(baseReducer: Reducer<T, FuzzTestState>): Reducer<T, FuzzTestState> =>
		(state, operation) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			if (loggingInfo !== undefined && (operation as any).taskId === loggingInfo.taskId) {
				logCurrentState(state, loggingInfo);
				console.log("-".repeat(20));
				console.log("Next operation:", JSON.stringify(operation, undefined, 4));
			}
			baseReducer(state, operation);
		};

	const reducer = combineReducers<Operation, FuzzTestState>({
		volunteer: ({ client }, { taskId }) => {
			// Note: this is fire-and-forget as `volunteerForTask` resolves/rejects its returned
			// promise based on server responses, which will occur on later operations (and
			// processing those operations will raise the error directly)
			client.channel.volunteerForTask(taskId).catch((error: Error) => {
				// We expect an error to be thrown if we are disconnected while volunteering
				const expectedErrors = [
					"Disconnected before acquiring task assignment",
					"Abandoned before acquiring task assignment",
				];
				if (!expectedErrors.includes(error.message)) {
					throw error;
				}
			});
		},
		abandon: ({ client }, { taskId }) => {
			client.channel.abandon(taskId);
		},
		subscribe: ({ client }, { taskId }) => {
			client.channel.subscribeToTask(taskId);
		},
		complete: ({ client }, { taskId }) => {
			try {
				client.channel.complete(taskId);
			} catch (error: unknown) {
				// We expect an error to be thrown if we are disconnected while trying to complete
				const expectedErrors = ["Attempted to complete task in disconnected state"];
				if (
					error instanceof Object &&
					"message" in error &&
					!expectedErrors.includes((error as Error).message)
				) {
					throw error as Error;
				}
			}
		},
	});

	return withLogging(reducer);
}

function assertEqualTaskManagers(a: ITaskManager, b: ITaskManager): void {
	/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
	const queue1: Map<string, string[]> = (a as any).taskQueues;
	const queue2: Map<string, string[]> = (b as any).taskQueues;
	/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */

	assert.strictEqual(queue1.size, queue2.size, "The number of tasks queues are not the same");
	for (const [key, val] of queue1) {
		const testVal = queue2.get(key);
		if (testVal === undefined) {
			assert(val === undefined, "Task queues are not both undefined");
			continue;
		}
		assert.strictEqual(testVal.length, val.length, "Task queues are not the same size");
		if (testVal.length > 0) {
			const testValArr = testVal;
			const valArr = val;
			for (const [index, task] of testValArr.entries()) {
				assert.strictEqual(task, valArr[index], `Task queues are not identical`);
			}
		}
	}
}

/**
 * Base fuzz model for TaskManager
 */
export const baseTaskManagerModel: DDSFuzzModel<TaskManagerFactory, Operation, FuzzTestState> =
	{
		workloadName: "default configuration",
		generatorFactory: () => take(100, makeOperationGenerator()),
		reducer:
			// makeReducer supports a param for logging output which tracks the provided intervalId over time:
			// { taskManagerNames: ["A", "B", "C"], taskId: "" },
			makeReducer(),
		validateConsistency: (a, b) => assertEqualTaskManagers(a.channel, b.channel),
		factory: new TaskManagerFactory(),
	};
