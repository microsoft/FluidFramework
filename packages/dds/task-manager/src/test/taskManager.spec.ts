/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { ReadOnlyInfo } from "@fluidframework/container-definitions/internal";
import type { MockContainerRuntimeForReconnection } from "@fluidframework/test-runtime-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { ITaskManager } from "../interfaces.js";
import { TaskManagerClass } from "../taskManager.js";
import { TaskManagerFactory } from "../taskManagerFactory.js";

/**
 * Internal shape exposed only for test introspection.
 *
 * Mirrors the `IndexedList` wrapper that `TaskManagerClass` uses for `taskQueues` so these
 * helpers can traverse the queue without depending on the structural details of the wrapper.
 */
interface TaskQueueLike {
	readonly length: number;
	readonly first: { readonly data: string } | undefined;
	[Symbol.iterator](): IterableIterator<{ readonly data: string }>;
}

/**
 * Reads the private `taskQueues` map off a {@link TaskManagerClass} for test introspection.
 */
function getInternalTaskQueues(taskManager: TaskManagerClass): Map<string, TaskQueueLike> {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
	return (taskManager as any).taskQueues;
}

/**
 * Returns the queue for `taskId` as an array of clientIds in queue order, or `undefined` if
 * no queue exists for that task.
 */
function getTaskQueueAsArray(
	taskManager: TaskManagerClass,
	taskId: string,
): string[] | undefined {
	const queue = getInternalTaskQueues(taskManager).get(taskId);
	if (queue === undefined) {
		return undefined;
	}
	const clientIds: string[] = [];
	for (const node of queue) {
		clientIds.push(node.data);
	}
	return clientIds;
}

/**
 * Returns the clientId at the head of the queue (the current lock holder candidate) for
 * `taskId`, or `undefined` if no queue exists.
 */
function getTaskQueueHead(taskManager: TaskManagerClass, taskId: string): string | undefined {
	return getInternalTaskQueues(taskManager).get(taskId)?.first?.data;
}

function createConnectedTaskManager(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): TaskManagerClass {
	// Create and connect a TaskManager.
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const taskManager = new TaskManagerClass(
		id,
		dataStoreRuntime,
		TaskManagerFactory.Attributes,
	);
	taskManager.connect(services);
	return taskManager;
}

function createDetachedTaskManager(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): { taskManager: TaskManagerClass; attach: () => Promise<void> } {
	// Create a detached TaskManager.
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		attachState: AttachState.Detached,
	});
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const clientId = dataStoreRuntime.clientId;

	const taskManager = new TaskManagerClass(
		id,
		dataStoreRuntime,
		TaskManagerFactory.Attributes,
	);
	const attach = async (): Promise<void> => {
		const services = {
			deltaConnection: dataStoreRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		// Manually trigger a summarize (should be done automatically when attaching normally)
		await taskManager.summarize();

		dataStoreRuntime.setAttachState(AttachState.Attached);
		taskManager.connect(services);

		// Ensure clientId is set after attach (might be forced undefined in some tests)
		dataStoreRuntime.clientId = clientId;
	};

	return { taskManager, attach };
}

describe("TaskManager", () => {
	describe("Connected state", () => {
		let taskManager1: ITaskManager;
		let taskManager2: ITaskManager;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			taskManager1 = createConnectedTaskManager("taskManager1", containerRuntimeFactory);
			taskManager2 = createConnectedTaskManager("taskManager2", containerRuntimeFactory);
		});

		it("Can create a connected TaskManager", () => {
			assert(taskManager1 !== undefined, "Could not create a task manager");
			assert(taskManager1.isAttached(), "TaskManager should be attached");
			assert((taskManager1 as TaskManagerClass).connected, "TaskManager should be connected");
		});

		describe("Volunteering for a task", () => {
			it("Can volunteer for a task", async () => {
				const taskId = "taskId";
				const volunteerTaskP = taskManager1.volunteerForTask(taskId);
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				containerRuntimeFactory.processAllMessages();
				const isAssigned = await volunteerTaskP;
				assert.ok(isAssigned, "Should resolve true");
				assert.ok(taskManager1.queued(taskId), "Should be queued");
				assert.ok(taskManager1.assigned(taskId), "Should be assigned");
			});

			it("Can wait for a task", async () => {
				const taskId = "taskId";
				const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
				const volunteerTaskP2 = taskManager2.volunteerForTask(taskId);

				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
				assert.ok(!taskManager2.queued(taskId), "Task manager 2 should not be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				containerRuntimeFactory.processAllMessages();
				const isAssigned1 = await volunteerTaskP1;
				assert.ok(isAssigned1, "Should resolve true");

				assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
				assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
				assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				taskManager1.abandon(taskId);
				containerRuntimeFactory.processAllMessages();
				const isAssigned2 = await volunteerTaskP2;
				assert.ok(isAssigned2, "Should resolve true");

				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should be queued");
				assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
				assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
				assert.ok(taskManager2.assigned(taskId), "Task manager 2 should not be assigned");
			});

			it("Rejects the promise if abandon before ack", async () => {
				const taskId = "taskId";
				const volunteerTaskP = taskManager1.volunteerForTask(taskId);
				taskManager1.abandon(taskId);
				// Will reject due to exiting the queue without first acquiring task
				// Promise should be settled already prior to processing messages
				await assert.rejects(volunteerTaskP);
				containerRuntimeFactory.processAllMessages();
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
			});

			it("Rejects the promise if abandon after ack but before acquire", async () => {
				const taskId = "taskId";
				const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
				const volunteerTaskP2 = taskManager2.volunteerForTask(taskId);

				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
				assert.ok(!taskManager2.queued(taskId), "Task manager 2 should not be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				containerRuntimeFactory.processAllMessages();
				const isAssigned = await volunteerTaskP1;
				assert.ok(isAssigned, "Should resolve true");

				assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
				assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
				assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				taskManager2.abandon(taskId);
				// Will reject due to exiting the queue without first acquiring task
				// Promise should be settled already prior to processing messages
				await assert.rejects(volunteerTaskP2);
				containerRuntimeFactory.processAllMessages();
				assert.ok(!taskManager2.queued(taskId), "Should not be queued");
				assert.ok(!taskManager2.assigned(taskId), "Should not be assigned");
			});

			it("Can abandon and immediately attempt to reacquire a task", async () => {
				const taskId = "taskId";
				const volunteerTaskP = taskManager1.volunteerForTask(taskId);
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				containerRuntimeFactory.processAllMessages();
				const isAssigned = await volunteerTaskP;
				assert.ok(isAssigned, "Should resolve true");
				assert.ok(taskManager1.queued(taskId), "Should be queued");
				assert.ok(taskManager1.assigned(taskId), "Should be assigned");

				taskManager1.abandon(taskId);
				assert.ok(taskManager1.queued(taskId), "Should still be queued (pending abandon)");
				assert.ok(taskManager1.assigned(taskId), "Should still be assigned (pending abandon)");
				const revolunteerTaskP = taskManager1.volunteerForTask(taskId);
				assert.ok(taskManager1.queued(taskId), "Should be queued");
				assert.ok(taskManager1.assigned(taskId), "Should still be assigned (pending abandon)");
				containerRuntimeFactory.processAllMessages();
				const isAssigned2 = await revolunteerTaskP;
				assert.ok(isAssigned2, "Should resolve true");
				assert.ok(taskManager1.queued(taskId), "Should be queued");
				assert.ok(taskManager1.assigned(taskId), "Should be assigned");
			});

			it("Can attempt to volunteer for task twice and abandon twice (after ack)", async () => {
				const taskId = "taskId";
				const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				containerRuntimeFactory.processAllMessages();
				const isAssigned1 = await volunteerTaskP1;
				assert.ok(isAssigned1, "Should resolve true");
				assert.ok(taskManager1.queued(taskId), "Should be queued");
				assert.ok(taskManager1.assigned(taskId), "Should be assigned");

				const volunteerTaskP2 = taskManager1.volunteerForTask(taskId);
				assert.ok(taskManager1.queued(taskId), "Should be queued");
				assert.ok(taskManager1.assigned(taskId), "Should be assigned");
				containerRuntimeFactory.processAllMessages();
				const isAssigned2 = await volunteerTaskP2;
				assert.ok(isAssigned2, "Should resolve true");
				assert.ok(taskManager1.queued(taskId), "Should be queued");
				assert.ok(taskManager1.assigned(taskId), "Should be assigned");

				taskManager1.abandon(taskId);
				assert.ok(taskManager1.queued(taskId), "Should still be queued (pending abandon)");
				assert.ok(taskManager1.assigned(taskId), "Should still be assigned (pending abandon)");
				containerRuntimeFactory.processAllMessages();
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");

				taskManager1.abandon(taskId);
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				containerRuntimeFactory.processAllMessages();
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
			});

			it("Can attempt to lock task twice and abandon twice (before ack)", async () => {
				const taskId = "taskId";
				const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");

				const volunteerTaskP2 = taskManager1.volunteerForTask(taskId);
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				containerRuntimeFactory.processAllMessages();
				const isAssigned1 = await volunteerTaskP1;
				assert.ok(isAssigned1, "Should resolve true");
				const isAssigned2 = await volunteerTaskP2;
				assert.ok(isAssigned2, "Should resolve true");
				assert.ok(taskManager1.queued(taskId), "Should be queued");
				assert.ok(taskManager1.assigned(taskId), "Should be assigned");

				taskManager1.abandon(taskId);
				assert.ok(taskManager1.queued(taskId), "Should still be queued (pending abandon)");
				assert.ok(taskManager1.assigned(taskId), "Should still be assigned (pending abandon)");
				taskManager1.abandon(taskId);
				assert.ok(taskManager1.queued(taskId), "Should still be queued (pending abandon)");
				assert.ok(taskManager1.assigned(taskId), "Should still be assigned (pending abandon)");
				containerRuntimeFactory.processAllMessages();
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
			});

			it("Can volunteer for a task immediately after it was completed", async () => {
				const taskId = "taskId";
				const volunteerTaskP = taskManager1.volunteerForTask(taskId);
				containerRuntimeFactory.processAllMessages();
				await volunteerTaskP;

				taskManager2.subscribeToTask(taskId);
				taskManager1.complete(taskId);
				const volunteerTaskP2 = taskManager1.volunteerForTask(taskId);
				containerRuntimeFactory.processAllMessages();
				await volunteerTaskP2;
				assert.ok(taskManager1.assigned(taskId), "taskManager1 should be assigned");
				assert.ok(!taskManager2.queued(taskId), "taskManager 2 should not be assigned");
			});
		});

		describe("Subscribing to a task", () => {
			it("Can subscribe to a task", async () => {
				const taskId = "taskId";
				taskManager1.subscribeToTask(taskId);

				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
				assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");

				containerRuntimeFactory.processAllMessages();

				assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
				assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
				assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");
			});

			it("Can abandon a subscribed task", async () => {
				const taskId = "taskId";
				taskManager1.subscribeToTask(taskId);
				containerRuntimeFactory.processAllMessages();

				taskManager1.abandon(taskId);
				containerRuntimeFactory.processAllMessages();

				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
				assert.ok(!taskManager1.subscribed(taskId), "Task manager 1 should not be subscribed");
			});

			it("Can subscribe and wait for a task", async () => {
				const taskId = "taskId";
				taskManager1.subscribeToTask(taskId);
				taskManager2.subscribeToTask(taskId);

				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
				assert.ok(!taskManager2.queued(taskId), "Task manager 2 should not be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				containerRuntimeFactory.processAllMessages();

				assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
				assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
				assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				taskManager1.abandon(taskId);
				containerRuntimeFactory.processAllMessages();
				assert.ok(taskManager2.assigned(taskId), "Task manager 2 should be assigned");
			});
		});

		describe("Completing tasks", () => {
			it("Can complete a task", async () => {
				const taskId = "taskId";
				const volunteerTaskP = taskManager1.volunteerForTask(taskId);
				containerRuntimeFactory.processAllMessages();
				await volunteerTaskP;
				assert.ok(taskManager1.assigned(taskId), "Should be assigned");

				taskManager1.complete(taskId);
				containerRuntimeFactory.processAllMessages();
				assert.ok(!taskManager1.queued(taskId), "Should not be queued");
				assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
			});

			it("Rejects the promise if you try to complete without being assigned", async () => {
				const taskId = "taskId";
				const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
				// eslint-disable-next-line no-void
				void taskManager2.volunteerForTask(taskId);

				containerRuntimeFactory.processAllMessages();
				await volunteerTaskP1;

				assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
				assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				assert.throws(() => {
					taskManager2.complete(taskId);
				}, "Should throw error");
				containerRuntimeFactory.processAllMessages();
				assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
			});

			it("Can complete a task and remove other clients from queue", async () => {
				const taskId = "taskId";
				const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
				const volunteerTaskP2 = taskManager2.volunteerForTask(taskId);

				containerRuntimeFactory.processAllMessages();
				const isAssigned1 = await volunteerTaskP1;
				assert.ok(isAssigned1, "Should resolve true");

				assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
				assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				taskManager1.complete(taskId);
				containerRuntimeFactory.processAllMessages();
				const isAssigned2 = await volunteerTaskP2;
				assert.ok(!isAssigned2, "Should resolve false");

				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
				assert.ok(!taskManager2.queued(taskId), "Task manager 2 should not be queued");
			});

			it("Can complete a task and remove other subscribed clients from queue", async () => {
				const taskId = "taskId";
				taskManager1.subscribeToTask(taskId);
				taskManager2.subscribeToTask(taskId);
				containerRuntimeFactory.processAllMessages();

				assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
				assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
				assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

				taskManager1.complete(taskId);
				containerRuntimeFactory.processAllMessages();

				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
				assert.ok(!taskManager2.queued(taskId), "Task manager 2 should not be queued");
			});

			it("Can emit completed event", async () => {
				const taskId = "taskId";
				const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
				taskManager2.subscribeToTask(taskId);

				containerRuntimeFactory.processAllMessages();
				await volunteerTaskP1;

				let taskManager1EventFired = false;
				let taskManager2EventFired = false;
				taskManager1.on("completed", (completedTaskId: string) => {
					assert.ok(completedTaskId === taskId, "taskId should match");
					assert.ok(
						!taskManager1EventFired,
						"Should only fire completed event once on taskManager1",
					);
					taskManager1EventFired = true;
				});
				taskManager2.on("completed", (completedTaskId: string) => {
					assert.ok(completedTaskId === taskId, "taskId should match");
					assert.ok(
						!taskManager2EventFired,
						"Should only fire completed event once on taskManager2",
					);
					taskManager2EventFired = true;
				});
				taskManager1.complete(taskId);
				containerRuntimeFactory.processAllMessages();
				assert.ok(
					taskManager1EventFired,
					"Should have raised completed event on taskManager1",
				);
				assert.ok(
					taskManager2EventFired,
					"Should have raised completed event on taskManager2",
				);
			});

			it("Can complete a task with a pending volunteer op", async () => {
				const taskId = "taskId";
				const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);

				containerRuntimeFactory.processAllMessages();
				await volunteerTaskP1;

				let taskManager1EventFired = false;
				let taskManager2EventFired = false;
				taskManager1.on("completed", (completedTaskId: string) => {
					assert.ok(completedTaskId === taskId, "taskId should match");
					assert.ok(
						!taskManager1EventFired,
						"Should only fire completed event once on taskManager1",
					);
					taskManager1EventFired = true;
				});
				taskManager2.on("completed", (completedTaskId: string) => {
					assert.ok(completedTaskId === taskId, "taskId should match");
					assert.ok(
						!taskManager2EventFired,
						"Should only fire completed event once on taskManager2",
					);
					taskManager2EventFired = true;
				});

				const volunteerTaskP2 = taskManager2.volunteerForTask(taskId);
				taskManager1.complete(taskId);
				containerRuntimeFactory.processAllMessages();
				await volunteerTaskP2;

				assert.ok(
					taskManager1EventFired,
					"Should have raised completed event on taskManager1",
				);
				assert.ok(
					taskManager2EventFired,
					"Should have raised completed event on taskManager2",
				);
				assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
				assert.ok(!taskManager2.queued(taskId), "Task manager 2 should not be queued");
			});
		});
	});

	// Note: Since read/write modes are not yet implemented in mocks, tests are limited to simulate these scenarios.
	describe("Read/Write Mode", () => {
		let taskManager1: ITaskManager;
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;

		const setReadOnlyInfo = (readOnlyInfo: ReadOnlyInfo): void => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			(taskManager1 as any).runtime.deltaManager.readOnlyInfo = readOnlyInfo;

			// Force connection to simulate read mode (TaskManager considered the client disconnected in read mode)
			containerRuntime1.connected = readOnlyInfo.readonly === false;
		};

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			taskManager1 = new TaskManagerClass(
				"task-manager-1",
				dataStoreRuntime1,
				TaskManagerFactory.Attributes,
			);
			taskManager1.connect(services1);
		});

		it("Immediately rejects attempts to volunteer in read mode", async () => {
			const taskId = "taskId";
			setReadOnlyInfo({
				readonly: true,
				permissions: false,
				forced: false,
				storageOnly: false,
			});

			const volunteerTaskP = taskManager1.volunteerForTask(taskId);
			assert.ok(!taskManager1.queued(taskId), "Should not be queued");
			assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
			await assert.rejects(volunteerTaskP);
			containerRuntimeFactory.processAllMessages();
			assert.ok(!taskManager1.queued(taskId), "Should not be queued");
			assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
		});

		it("Immediately rejects attempts to volunteer with read-only permissions", async () => {
			const taskId = "taskId";
			setReadOnlyInfo({
				readonly: true,
				permissions: true,
				forced: false,
				storageOnly: false,
			});

			const volunteerTaskP = taskManager1.volunteerForTask(taskId);
			assert.ok(!taskManager1.queued(taskId), "Should not be queued");
			assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
			await assert.rejects(volunteerTaskP);
			containerRuntimeFactory.processAllMessages();
			assert.ok(!taskManager1.queued(taskId), "Should not be queued");
			assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
		});

		it("Can subscribe while in read mode", async () => {
			const taskId = "taskId";
			setReadOnlyInfo({
				readonly: true,
				permissions: false,
				forced: false,
				storageOnly: false,
			});

			taskManager1.subscribeToTask(taskId);
			containerRuntimeFactory.processAllMessages();

			assert.ok(!taskManager1.queued(taskId), "Should not be queued");
			assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
			assert.ok(taskManager1.subscribed(taskId), "Should be subscribed");

			setReadOnlyInfo({ readonly: false });
			containerRuntimeFactory.processAllMessages();

			assert.ok(taskManager1.queued(taskId), "Should be queued");
			assert.ok(taskManager1.assigned(taskId), "Should be assigned");
			assert.ok(taskManager1.subscribed(taskId), "Should be subscribed");
		});

		it("Immediately rejects attempts to subscribe with read-only permissions", async () => {
			const taskId = "taskId";
			setReadOnlyInfo({
				readonly: true,
				permissions: true,
				forced: false,
				storageOnly: false,
			});

			assert.throws(() => {
				taskManager1.subscribeToTask(taskId);
			}, "Should throw error if subscribing with read-only permissions");
			containerRuntimeFactory.processAllMessages();

			assert.ok(!taskManager1.queued(taskId), "Should not be queued");
			assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
			assert.ok(!taskManager1.subscribed(taskId), "Should not be subscribed");
		});
	});

	describe("Detached/Attach", () => {
		let taskManager1: TaskManagerClass;
		let attachTaskManager1: () => Promise<void>;
		// let taskManager2: ITaskManager;
		// let attachTaskManager2: () => void;
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		const placeholderClientId = "placeholder";

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			const createResponse1 = createDetachedTaskManager(
				"taskManager1",
				containerRuntimeFactory,
			);
			taskManager1 = createResponse1.taskManager;
			attachTaskManager1 = createResponse1.attach;
		});

		it("Can create a detached TaskManager and attach later", async () => {
			assert.ok(!taskManager1.isAttached(), "taskManager1 should be detached");
			await attachTaskManager1();
			assert.ok(taskManager1.isAttached(), "taskManager1 should be attached");
		});

		describe("Behavior before attach", () => {
			describe("Volunteering for a task", () => {
				it("Can volunteer for a task before attach", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP;
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
				});

				it("Can volunteer and abandon a task before attach", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP;
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
					taskManager1.abandon(taskId);
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				});

				it("Can abandon and immediately attempt to reacquire a task while detached", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
					const isAssigned = await volunteerTaskP;
					assert.ok(isAssigned, "Should resolve true");
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");

					taskManager1.abandon(taskId);
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
					const revolunteerTaskP = taskManager1.volunteerForTask(taskId);
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
					const isAssigned2 = await revolunteerTaskP;
					assert.ok(isAssigned2, "Should resolve true");
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
				});
			});

			describe("Subscribing to a task", () => {
				it("Can subscribe to a task before attach", async () => {
					const taskId = "taskId";
					taskManager1.subscribeToTask(taskId);
					containerRuntimeFactory.processAllMessages();
					assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
					assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");
				});

				it("Can abandon a subscribed task before attach", async () => {
					const taskId = "taskId";
					taskManager1.subscribeToTask(taskId);
					containerRuntimeFactory.processAllMessages();

					taskManager1.abandon(taskId);
					containerRuntimeFactory.processAllMessages();

					assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
					assert.ok(
						!taskManager1.subscribed(taskId),
						"Task manager 1 should not be subscribed",
					);
				});
			});

			describe("Completing tasks", () => {
				it("Can complete a task before attach", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP;
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");

					taskManager1.complete(taskId);
					containerRuntimeFactory.processAllMessages();
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				});

				it("Can emit completed event before attach", async () => {
					const taskId = "taskId";
					const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);

					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP1;

					let taskManager1EventFired = false;
					taskManager1.once("completed", (completedTaskId: string) => {
						assert.ok(completedTaskId === taskId, "taskId should match");
						assert.ok(
							!taskManager1EventFired,
							"Should only fire completed event once on taskManager1",
						);
						taskManager1EventFired = true;
					});
					taskManager1.complete(taskId);
					containerRuntimeFactory.processAllMessages();
					assert.ok(
						taskManager1EventFired,
						"Should have raised completed event on taskManager1",
					);
				});
			});
		});

		describe("Behavior after attaching", () => {
			describe("Volunteering for a task", () => {
				it("Will keep task assignment after attaching if clientId is defined", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP;
					await attachTaskManager1();
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
				});

				it("Will lose task assignment after attaching if clientId is undefined", async () => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					(taskManager1 as any).runtime.clientId = undefined;
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP;
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
					assert.strictEqual(
						getTaskQueueHead(taskManager1, taskId),
						placeholderClientId,
						"taskQueue should have placeholder clientId",
					);

					let taskManager1EventFired = false;
					taskManager1.on("lost", (completedTaskId: string) => {
						assert.ok(completedTaskId === taskId, "taskId should match");
						assert.ok(
							!taskManager1EventFired,
							"Should only fire lost event once on taskManager1",
						);
						taskManager1EventFired = true;
					});
					await attachTaskManager1();

					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
					assert.ok(taskManager1EventFired, "Should have raised lost event on taskManager1");
					assert.ok(
						getInternalTaskQueues(taskManager1).size === 0,
						"taskQueue should be empty",
					);
				});
			});

			describe("Subscribing to a task", () => {
				it("Can subscribe to a task and stay assigned/subscribed after attach", async () => {
					const taskId = "taskId";
					taskManager1.subscribeToTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await attachTaskManager1();
					containerRuntimeFactory.processAllMessages();
					assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
					assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");
				});

				it("Can subscribe to a task and stay subscribed after attach if clientId was undefined", async () => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					(taskManager1 as any).runtime.clientId = undefined;
					const taskId = "taskId";
					taskManager1.subscribeToTask(taskId);
					containerRuntimeFactory.processAllMessages();
					let taskManager1EventFired = false;
					taskManager1.on("lost", (completedTaskId: string) => {
						assert.ok(completedTaskId === taskId, "taskId should match");
						assert.ok(
							!taskManager1EventFired,
							"Should only fire lost event once on taskManager1",
						);
						taskManager1EventFired = true;
					});

					await attachTaskManager1();
					assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");

					containerRuntimeFactory.processAllMessages();
					assert.ok(taskManager1EventFired, "Should have raised lost event on taskManager1");
					assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
					assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");

					assert.ok(
						(getInternalTaskQueues(taskManager1).get(taskId)?.length ?? 0) !== 0,
						"taskQueue should not be empty",
					);
					assert.notStrictEqual(
						getTaskQueueHead(taskManager1, taskId),
						placeholderClientId,
						"taskQueue should not have placeholder clientId",
					);
				});

				it("Can abandon a subscribed task after attach", async () => {
					const taskId = "taskId";
					taskManager1.subscribeToTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await attachTaskManager1();
					taskManager1.abandon(taskId);
					containerRuntimeFactory.processAllMessages();
					assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
					assert.ok(
						!taskManager1.subscribed(taskId),
						"Task manager 1 should not be subscribed",
					);
				});
			});

			describe("Completing tasks", () => {
				it("Can complete a task after attach", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP;
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
					await attachTaskManager1();
					taskManager1.complete(taskId);
					containerRuntimeFactory.processAllMessages();
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				});

				it("Can emit completed event after attach", async () => {
					const taskId = "taskId";
					const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP1;
					await attachTaskManager1();
					let taskManager1EventFired = false;
					taskManager1.on("completed", (completedTaskId: string) => {
						assert.ok(completedTaskId === taskId, "taskId should match");
						assert.ok(
							!taskManager1EventFired,
							"Should only fire completed event once on taskManager1",
						);
						taskManager1EventFired = true;
					});
					taskManager1.complete(taskId);
					containerRuntimeFactory.processAllMessages();
					assert.ok(
						taskManager1EventFired,
						"Should have raised completed event on taskManager1",
					);
				});
			});
		});
	});

	describe("Disconnect/Reconnect", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let taskManager1: TaskManagerClass;
		let taskManager2: TaskManagerClass;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Create the first TaskManager.
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			taskManager1 = new TaskManagerClass(
				"task-manager-1",
				dataStoreRuntime1,
				TaskManagerFactory.Attributes,
			);
			taskManager1.connect(services1);

			// Create the second TaskManager.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			taskManager2 = new TaskManagerClass(
				"task-manager-2",
				dataStoreRuntime2,
				TaskManagerFactory.Attributes,
			);
			taskManager2.connect(services2);
		});

		it("Can create a TaskManager while disconnected", () => {
			containerRuntime1.connected = false;
			assert(taskManager1 !== undefined, "Could not create a task manager");
			assert(taskManager1.isAttached(), "TaskManager should be attached");
			assert(!taskManager1.connected, "TaskManager should be disconnected");
		});

		describe("Behavior transitioning to disconnect", () => {
			describe("Volunteering for a task", () => {
				it("Disconnect while assigned: Raises a lost event and loses the task assignment", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					const isAssigned = await volunteerTaskP;
					assert.ok(isAssigned, "Should resolve true");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");

					let lostRaised = false;
					taskManager1.once("lost", () => {
						lostRaised = true;
					});

					containerRuntime1.connected = false;
					containerRuntimeFactory.processAllMessages();
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
					assert.ok(lostRaised, "Should have raised a lost event");
				});

				it("Disconnect while queued: Rejects the volunteerForTask promise and exits the queue", async () => {
					const taskId = "taskId";
					const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
					const volunteerTaskP2 = taskManager2.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					const isAssigned = await volunteerTaskP1;
					assert.ok(isAssigned, "Should resolve true");
					assert.ok(taskManager1.assigned(taskId), "Task manager 1 Should be assigned");
					assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
					assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");

					containerRuntime2.connected = false;
					containerRuntimeFactory.processAllMessages();
					await assert.rejects(volunteerTaskP2, "Should have rejected the P2 promise");
					assert.ok(!taskManager2.queued(taskId), "Task manager 2 should not be queued");
					assert.ok(!taskManager2.assigned(taskId), "Task manager 2 should not be assigned");
				});

				it("Disconnect while queued: Removed from the queue for other clients", async () => {
					const taskId = "taskId";
					const volunteerTaskP1 = taskManager1.volunteerForTask(taskId);
					taskManager2.subscribeToTask(taskId);
					containerRuntimeFactory.processAllMessages();
					await volunteerTaskP1;
					const clientId1 = containerRuntime1.clientId;
					const clientId2 = containerRuntime2.clientId;

					assert.deepEqual(
						getTaskQueueAsArray(taskManager1, taskId),
						[clientId1, clientId2],
						"Task queue should have both clients",
					);

					containerRuntime2.connected = false;
					containerRuntimeFactory.processAllMessages();

					assert.deepEqual(
						getTaskQueueAsArray(taskManager1, taskId),
						[clientId1],
						"Task queue should only have client 1",
					);
				});

				it("Disconnect while pending: Rejects the volunteerForTask promise", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntime1.connected = false;
					containerRuntimeFactory.processAllMessages();
					await assert.rejects(volunteerTaskP, "Should have rejected the promise");
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				});
			});

			describe("Subscribing to a task", () => {});

			describe("Completing tasks", () => {});
		});

		describe("Behavior while disconnected", () => {
			describe("Volunteering for a task", () => {
				it("Immediately rejects attempts to lock task and throws on abandon", async () => {
					const taskId = "taskId";
					containerRuntime1.connected = false;
					containerRuntimeFactory.processAllMessages();

					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
					await assert.rejects(volunteerTaskP);
					containerRuntimeFactory.processAllMessages();
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				});
			});

			describe("Subscribing to a task", () => {
				it("Can subscribe while disconnected", async () => {
					const taskId = "taskId";
					containerRuntime1.connected = false;
					containerRuntimeFactory.processAllMessages();

					taskManager1.subscribeToTask(taskId);
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");

					containerRuntimeFactory.processAllMessages();
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");

					containerRuntime1.connected = true;
					containerRuntimeFactory.processAllMessages();
					assert.ok(taskManager1.queued(taskId), "Should be queued");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");
				});

				it("Can abandon subscription while disconnected", async () => {
					const taskId = "taskId";
					containerRuntime1.connected = false;
					containerRuntimeFactory.processAllMessages();

					taskManager1.subscribeToTask(taskId);
					taskManager1.abandon(taskId);
					containerRuntimeFactory.processAllMessages();

					containerRuntime1.connected = true;
					containerRuntimeFactory.processAllMessages();
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
					assert.ok(
						!taskManager1.subscribed(taskId),
						"Task manager 1 should not be subscribed",
					);
				});

				it("Can subscribe to a task while disconnected and pending abandon won't be applied", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntimeFactory.processAllMessages();
					const isAssigned = await volunteerTaskP;
					assert.ok(isAssigned, "Should resolve true");
					assert.ok(taskManager1.assigned(taskId), "Should be assigned");

					taskManager1.abandon(taskId);
					// Abandon won't be processed anymore since we're now disconnected and we
					// don't resubmit ops.
					containerRuntime1.connected = false;

					taskManager1.subscribeToTask(taskId);
					containerRuntime1.connected = true;
					containerRuntimeFactory.processAllMessages();

					assert.equal(taskManager1.assigned(taskId), true, "Should be assigned");
				});

				it("Can abandon subscription to multiple tasks while disconnected", async () => {
					const taskId1 = "taskId1";
					const taskId2 = "taskId2";
					const taskId3 = "taskId3";
					containerRuntime1.connected = false;

					taskManager1.subscribeToTask(taskId1);
					taskManager1.subscribeToTask(taskId2);
					taskManager1.subscribeToTask(taskId3);

					containerRuntime1.connected = true;
					containerRuntimeFactory.processAllMessages();

					assert.deepEqual(
						[
							taskManager1.assigned(taskId1),
							taskManager1.assigned(taskId2),
							taskManager1.assigned(taskId3),
						],
						[true, true, true],
						"Should be assigned all tasks",
					);
				});

				it("Can abandon subscription to multiple tasks while disconnected and abandon/complete after", async () => {
					const taskId1 = "taskId1";
					const taskId2 = "taskId2";
					const taskId3 = "taskId3";
					containerRuntime1.connected = false;

					taskManager1.subscribeToTask(taskId1);
					taskManager1.subscribeToTask(taskId2);
					taskManager1.subscribeToTask(taskId3);

					containerRuntime1.connected = true;
					containerRuntimeFactory.processAllMessages();

					taskManager1.abandon(taskId1);
					taskManager1.complete(taskId3);
					containerRuntimeFactory.processAllMessages();

					assert.deepEqual(
						[
							taskManager1.assigned(taskId1),
							taskManager1.assigned(taskId2),
							taskManager1.assigned(taskId3),
						],
						[false, true, false],
						"Should only be assigned task 2",
					);
				});

				it("Can abandon subscription to multiple tasks while disconnected and abandon/resubscribe after", async () => {
					const taskId1 = "taskId1";
					const taskId2 = "taskId2";
					const taskId3 = "taskId3";
					containerRuntime1.connected = false;

					taskManager1.subscribeToTask(taskId1);
					taskManager1.subscribeToTask(taskId2);
					taskManager1.subscribeToTask(taskId3);

					containerRuntime1.connected = true;
					containerRuntimeFactory.processAllMessages();

					taskManager1.abandon(taskId1);
					taskManager1.subscribeToTask(taskId1);
					containerRuntimeFactory.processAllMessages();

					assert.deepEqual(
						[
							taskManager1.assigned(taskId1),
							taskManager1.assigned(taskId2),
							taskManager1.assigned(taskId3),
						],
						[true, true, true],
						"Should be subscribed to all tasks",
					);
				});
			});

			describe("Completing tasks", () => {
				it("Immediately throws on attempt to complete task", async () => {
					const taskId = "taskId";
					containerRuntime1.connected = false;
					containerRuntimeFactory.processAllMessages();

					assert.throws(() => {
						taskManager1.complete(taskId);
					}, "Should throw error");
					containerRuntimeFactory.processAllMessages();
				});
			});
		});

		describe("Behavior transitioning to connected", () => {
			describe("Volunteering for a task", () => {
				it("Does not re-attempt to enter the queue for un-ack'd ops", async () => {
					const taskId = "taskId";
					const volunteerTaskP = taskManager1.volunteerForTask(taskId);
					containerRuntime1.connected = false;
					containerRuntimeFactory.processAllMessages();
					await assert.rejects(volunteerTaskP, "Should have rejected the promise");
					containerRuntime1.connected = true;
					containerRuntimeFactory.processAllMessages();
					assert.ok(!taskManager1.queued(taskId), "Should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Should not be assigned");
				});
			});

			describe("Subscribing to a task", () => {
				it("Does re-attempt to enter the queue when subscribed", async () => {
					const taskId = "taskId";
					taskManager1.subscribeToTask(taskId);
					containerRuntimeFactory.processAllMessages();

					containerRuntime1.connected = false;

					assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");

					containerRuntime1.connected = true;

					assert.ok(!taskManager1.queued(taskId), "Task manager 1 should not be queued");
					assert.ok(!taskManager1.assigned(taskId), "Task manager 1 should not be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");

					containerRuntimeFactory.processAllMessages();

					assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
					assert.ok(taskManager1.assigned(taskId), "Task manager 1 should be assigned");
					assert.ok(taskManager1.subscribed(taskId), "Task manager 1 should be subscribed");
				});
			});

			describe("Completing tasks", () => {});
		});
	});

	describe("Queue ordering regressions", () => {
		// These tests exercise invariants around queue ordering that were previously
		// guaranteed by the side-by-side `taskQueues` + `taskQueueIndex` structures and
		// are now guaranteed by the `IndexedList` wrapper.

		describe("scrubClientsNotInQuorum", () => {
			it("removes only the non-quorum clients and preserves the relative order of survivors", async () => {
				// Wire up a queue with multiple clients via real volunteer ops so we don't
				// have to manufacture an `IndexedList` from outside the module.
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const taskManager1 = createConnectedTaskManager("tm1", containerRuntimeFactory);
				const taskManager2 = createConnectedTaskManager("tm2", containerRuntimeFactory);
				const taskManager3 = createConnectedTaskManager("tm3", containerRuntimeFactory);
				const taskManager4 = createConnectedTaskManager("tm4", containerRuntimeFactory);

				const taskId = "taskId";
				const p1 = taskManager1.volunteerForTask(taskId);
				// Subscribe the others (rather than awaiting their volunteer promises) so
				// they join the queue without leaving outstanding promises that never
				// settle (only the head of the queue resolves).
				taskManager2.subscribeToTask(taskId);
				taskManager3.subscribeToTask(taskId);
				taskManager4.subscribeToTask(taskId);
				containerRuntimeFactory.processAllMessages();
				await p1;

				// Capture the established queue order so the assertion is independent of
				// the (random) clientId values.
				const initialOrder = getTaskQueueAsArray(taskManager1, taskId);
				assert.ok(initialOrder?.length === 4);
				const c1 = initialOrder[0] as string;
				const c2 = initialOrder[1] as string;
				const c3 = initialOrder[2] as string;
				const c4 = initialOrder[3] as string;

				// Remove clients 2 and 4 from the quorum's underlying members map
				// *without* emitting the `removeMember` event — that event is what would
				// normally trigger removeClientFromAllQueues. By suppressing it, we leave
				// stale entries in the queue and force scrubClientsNotInQuorum to do the
				// work we want to test.
				/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
				const quorumMembers: Map<string, unknown> = (taskManager1 as any).runtime.getQuorum()
					.members;
				quorumMembers.delete(c2);
				quorumMembers.delete(c4);
				(taskManager1 as any).scrubClientsNotInQuorum();
				/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */

				assert.deepEqual(
					getTaskQueueAsArray(taskManager1, taskId),
					[c1, c3],
					"Survivors must remain in their original relative order",
				);
			});
		});

		describe("Placeholder → real clientId substitution", () => {
			it("keeps the head of the queue stable when the placeholder is the lock holder", async () => {
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const { taskManager: taskManagerDetached } = createDetachedTaskManager(
					"detached",
					containerRuntimeFactory,
				);

				// Force runtime.clientId to undefined so the detached volunteer path inserts
				// the placeholder clientId rather than the auto-generated one. We then
				// manually splice other clients in behind the placeholder via the private
				// `addClientToQueue` so we can verify the placeholder→real swap preserves
				// the placeholder's position rather than reinserting at the tail.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(taskManagerDetached as any).runtime.clientId = undefined;

				const taskId = "taskId";
				const volunteerP = taskManagerDetached.volunteerForTask(taskId);
				containerRuntimeFactory.processAllMessages();
				await volunteerP;

				// Inject fake quorum members so addClientToQueue accepts them.
				/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
				const quorum: { addMember: (id: string, c: unknown) => void } = (
					taskManagerDetached as any
				).runtime.getQuorum();
				quorum.addMember("other-1", {});
				quorum.addMember("other-2", {});
				/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManagerDetached as any).addClientToQueue(taskId, "other-1");
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManagerDetached as any).addClientToQueue(taskId, "other-2");

				assert.deepEqual(
					getTaskQueueAsArray(taskManagerDetached, taskId),
					["placeholder", "other-1", "other-2"],
					"Pre-condition: placeholder is at the head",
				);

				// Trigger the substitution path.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(taskManagerDetached as any).runtime.clientId = "real-client";
				quorum.addMember("real-client", {});
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManagerDetached as any).replacePlaceholderInAllQueues();

				assert.deepEqual(
					getTaskQueueAsArray(taskManagerDetached, taskId),
					["real-client", "other-1", "other-2"],
					"Real clientId must take the placeholder's slot, not append at the tail",
				);
			});
		});

		describe("reSubmitCore", () => {
			it("removes the matching pending op without disturbing siblings", async () => {
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const taskManager = createConnectedTaskManager("tm", containerRuntimeFactory);
				const taskId = "taskId";

				// Submit three volunteer ops back-to-back without processing — this drives
				// `latestPendingOps[taskId]` to hold three entries, each with a distinct
				// messageId.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).submitVolunteerOp(taskId);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).submitVolunteerOp(taskId);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).submitVolunteerOp(taskId);

				type PendingOpList = Iterable<{ data: { type: string; messageId: number } }>;
				/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
				const pendingOps: PendingOpList = (taskManager as any).latestPendingOps.get(taskId);
				/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
				assert.ok(pendingOps !== undefined);
				const messageIds: number[] = [];
				for (const node of pendingOps) {
					messageIds.push(node.data.messageId);
				}
				assert.strictEqual(messageIds.length, 3);
				const firstId = messageIds[0] as number;
				const middleId = messageIds[1] as number;
				const lastId = messageIds[2] as number;

				// Resubmit only the middle op — the matching op should be removed and the
				// surviving siblings should remain in their original relative order.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).reSubmitCore({ type: "volunteer", taskId }, middleId);

				const surviving: number[] = [];
				for (const node of pendingOps) {
					surviving.push(node.data.messageId);
				}
				// reSubmitCore re-submits a fresh volunteer op when the last pending is not
				// an abandon, which appends a new entry at the tail with a messageId greater
				// than `lastId`. The leading entries should be the original first/last in
				// their original relative order.
				assert.strictEqual(surviving.length, 3);
				assert.strictEqual(surviving[0], firstId, "First sibling must keep its slot");
				assert.strictEqual(
					surviving[1],
					lastId,
					"Last sibling must keep its slot (relative to surviving siblings)",
				);
				assert.ok(
					(surviving[2] as number) > lastId,
					"Resubmitted volunteer op should be appended at the tail",
				);
			});
		});

		describe("rollback", () => {
			it("rolls back the latest pending op (LIFO)", async () => {
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const taskManager = createConnectedTaskManager("tm", containerRuntimeFactory);
				const taskId = "taskId";

				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).submitVolunteerOp(taskId);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).submitAbandonOp(taskId);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).submitVolunteerOp(taskId);

				type PendingOpList = Iterable<{ data: { type: string; messageId: number } }>;
				/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
				const pendingOps: PendingOpList = (taskManager as any).latestPendingOps.get(taskId);
				/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
				assert.ok(pendingOps !== undefined);
				const messageIds: number[] = [];
				const types: string[] = [];
				for (const node of pendingOps) {
					messageIds.push(node.data.messageId);
					types.push(node.data.type);
				}
				assert.deepEqual(types, ["volunteer", "abandon", "volunteer"]);
				const lastId = messageIds[2];

				// Rolling back the last submitted op should pop only the tail entry and
				// leave the head/middle untouched.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).rollback({ type: "volunteer", taskId }, lastId);

				const remainingTypes: string[] = [];
				for (const node of pendingOps) {
					remainingTypes.push(node.data.type);
				}
				assert.deepEqual(
					remainingTypes,
					["volunteer", "abandon"],
					"Rollback must pop only the tail (LIFO)",
				);

				// Rolling back the abandon (now the tail) should similarly only remove it.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
				(taskManager as any).rollback({ type: "abandon", taskId }, messageIds[1]);

				const finalTypes: string[] = [];
				for (const node of pendingOps) {
					finalTypes.push(node.data.type);
				}
				assert.deepEqual(finalTypes, ["volunteer"]);
			});
		});

		describe("summarize → loadCore round-trip", () => {
			it("preserves queue order across summary/load", async () => {
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const taskManager1 = createConnectedTaskManager("tm1", containerRuntimeFactory);
				const taskManager2 = createConnectedTaskManager("tm2", containerRuntimeFactory);
				const taskManager3 = createConnectedTaskManager("tm3", containerRuntimeFactory);
				const taskId1 = "taskA";
				const taskId2 = "taskB";

				// Use subscribe for the followers so we don't leave outstanding volunteer
				// promises that never settle (only the head of each queue resolves).
				const p1a = taskManager1.volunteerForTask(taskId1);
				taskManager2.subscribeToTask(taskId1);
				taskManager3.subscribeToTask(taskId1);
				const p3b = taskManager3.volunteerForTask(taskId2);
				taskManager1.subscribeToTask(taskId2);
				containerRuntimeFactory.processAllMessages();
				await Promise.all([p1a, p3b]);

				const expectedA = getTaskQueueAsArray(taskManager1, taskId1);
				const expectedB = getTaskQueueAsArray(taskManager1, taskId2);
				assert.ok(expectedA?.length === 3);
				assert.ok(expectedB?.length === 2);

				// Round-trip the summary into a fresh TaskManager and verify the queues
				// come back in the same order.
				const summaryResult = await taskManager1.summarize();
				const services = MockSharedObjectServices.createFromSummary(summaryResult.summary);

				// We need all the original clientIds present in the new runtime's quorum
				// so scrubClientsNotInQuorum (called from loadCore) doesn't drop them.
				const reloadedRuntime = new MockFluidDataStoreRuntime();
				containerRuntimeFactory.createContainerRuntime(reloadedRuntime);
				for (const clientId of [...expectedA, ...expectedB]) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
					(reloadedRuntime as any).quorum.addMember(clientId, {});
				}

				const reloaded = new TaskManagerClass(
					"tm-reloaded",
					reloadedRuntime,
					TaskManagerFactory.Attributes,
				);
				await reloaded.load(services);

				assert.deepEqual(
					getTaskQueueAsArray(reloaded, taskId1),
					expectedA,
					"taskA queue ordering must survive summary/load",
				);
				assert.deepEqual(
					getTaskQueueAsArray(reloaded, taskId2),
					expectedB,
					"taskB queue ordering must survive summary/load",
				);
			});
		});
	});
});
