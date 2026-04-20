/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { MockContainerRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { timeoutAwait } from "@fluidframework/test-utils/internal";

import type { ITaskManager } from "../interfaces.js";
import { TaskManagerFactory } from "../taskManagerFactory.js";

const taskManagerFactory = new TaskManagerFactory();

function setupRollbackTest(): {
	taskManager: ITaskManager;
	containerRuntime: MockContainerRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
} {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 }); // TurnBased
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const taskManager = taskManagerFactory.create(dataStoreRuntime, "task-manager-1");
	taskManager.connect(services);

	return { taskManager, containerRuntime, containerRuntimeFactory };
}

function createAdditionalClient(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string = "2",
): {
	taskManager: ITaskManager;
	containerRuntime: MockContainerRuntime;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const taskManager = taskManagerFactory.create(dataStoreRuntime, "task-manager-1");
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	taskManager.connect(services);
	return { taskManager, containerRuntime };
}

const taskId = "taskId1";
// We only want a very short wait in most circumstances since we mostly checking that a promise does not immediately resolve.
const durationMs = 5;

describe("TaskManager Rollback", () => {
	describe("Rollback without remote ops", () => {
		it("Can rollback volunteer", async () => {
			const { taskManager, containerRuntime, containerRuntimeFactory } = setupRollbackTest();

			let assignedEvents = 0;
			taskManager.on("assigned", () => {
				assignedEvents++;
			});

			const volunteerP = taskManager.volunteerForTask(taskId);

			containerRuntime.rollback?.();

			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const assigned = await volunteerP;

			assert.deepEqual(
				[taskManager.assigned(taskId), assignedEvents, assigned],
				[false, 0, false],
				"Task manager should be unassigned with no events after volunteer rollback",
			);
		});

		it("Can rollback abandon", async () => {
			const { taskManager, containerRuntime, containerRuntimeFactory } = setupRollbackTest();

			let lostEvents = 0;
			taskManager.on("lost", () => {
				lostEvents++;
			});

			const volunteerP = taskManager.volunteerForTask(taskId);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const assigned = await volunteerP;
			assert.equal(assigned, true, "taskManager should still be assigned post-rollback");

			taskManager.abandon(taskId);
			assert.equal(
				taskManager.assigned(taskId),
				true,
				"task manager should still be assigned pre-rollback",
			);
			assert.equal(lostEvents, 0, "should not have emitted lost event pre-rollback");

			containerRuntime.rollback?.();
			containerRuntimeFactory.processAllMessages();

			assert.equal(
				taskManager.assigned(taskId),
				true,
				"task manager should still be assigned post-rollback",
			);
			assert.equal(lostEvents, 0, "should not have emitted lost event post-rollback");
		});

		it("Can rollback subscribe", async () => {
			const { taskManager, containerRuntime, containerRuntimeFactory } = setupRollbackTest();

			let assignedEvents = 0;
			taskManager.on("assigned", () => {
				assignedEvents++;
			});

			taskManager.subscribeToTask(taskId);

			containerRuntime.rollback?.();

			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepEqual(
				[taskManager.assigned(taskId), assignedEvents],
				[false, 0],
				"Task manager should be unassigned with no events after subscribe rollback",
			);
		});

		it("Can rollback complete", async () => {
			const { taskManager, containerRuntime, containerRuntimeFactory } = setupRollbackTest();

			let completedEvents = 0;
			taskManager.on("completed", () => {
				completedEvents++;
			});

			const volunteerP = taskManager.volunteerForTask(taskId);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			const assigned = await volunteerP;
			assert(assigned, "taskManager should be assigned to task");

			taskManager.complete(taskId);
			assert.equal(
				taskManager.assigned(taskId),
				true,
				"task manager should still be assigned pre-rollback",
			);
			assert.equal(completedEvents, 0, "should have not emitted completed event pre-rollback");

			containerRuntime.rollback?.();

			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.equal(
				taskManager.assigned(taskId),
				true,
				"task manager should still be assigned post-rollback",
			);
			assert.equal(
				completedEvents,
				0,
				"should have not emitted completed event post-rollback",
			);
		});
	});

	describe("Rollback with remote ops", () => {
		it("Can rollback volunteer op across remote ops", async () => {
			const {
				taskManager: taskManager1,
				containerRuntime: containerRuntime1,
				containerRuntimeFactory,
			} = setupRollbackTest();
			const { taskManager: taskManager2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			let assignedEvents1 = 0;
			let assignedEvents2 = 0;
			taskManager1.on("assigned", () => {
				assignedEvents1++;
			});
			taskManager2.on("assigned", () => {
				assignedEvents2++;
			});

			const volunteerP1 = taskManager1.volunteerForTask(taskId);
			const volunteerP2 = taskManager2.volunteerForTask(taskId);

			containerRuntime1.rollback?.();

			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			const assigned1 = await volunteerP1;
			const assigned2 = await volunteerP2;

			assert.deepEqual(
				[
					taskManager1.assigned(taskId),
					assignedEvents1,
					assigned1,
					taskManager2.assigned(taskId),
					assignedEvents2,
					assigned2,
				],
				[false, 0, false, true, 1, true],
				"TaskManager1 should be unassigned and taskManager2 should be assigned after rollback",
			);
		});

		it("Can rollback abandon op across remote ops", async () => {
			const {
				taskManager: taskManager1,
				containerRuntime: containerRuntime1,
				containerRuntimeFactory,
			} = setupRollbackTest();
			const { taskManager: taskManager2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			let assignedEvents2 = 0;
			let lostEvents1 = 0;
			taskManager2.on("assigned", () => {
				assignedEvents2++;
			});
			taskManager1.on("lost", () => {
				lostEvents1++;
			});

			const volunteerP1 = taskManager1.volunteerForTask(taskId);
			const volunteerP2 = taskManager2.volunteerForTask(taskId);
			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();
			const assigned1 = await volunteerP1;
			const assigned2 = await timeoutAwait(volunteerP2, {
				durationMs,
				reject: false,
				value: false,
			});

			assert.deepEqual(
				[assigned1, assigned2],
				[true, false],
				"TaskManager1 should be assigned and taskManager2 should not be assigned initially",
			);

			taskManager1.abandon(taskId);
			containerRuntime1.rollback?.();

			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepEqual(
				[
					taskManager1.assigned(taskId),
					taskManager2.assigned(taskId),
					assignedEvents2,
					lostEvents1,
				],
				[true, false, 0, 0],
				"TaskManager1 should remain assigned with no events emitted after abandon rollback",
			);
		});

		it("Can rollback complete across remote ops", async () => {
			const {
				taskManager: taskManager1,
				containerRuntime: containerRuntime1,
				containerRuntimeFactory,
			} = setupRollbackTest();
			const { taskManager: taskManager2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			let completedEvents1 = 0;
			taskManager1.on("completed", () => {
				completedEvents1++;
			});

			const volunteerP1 = taskManager1.volunteerForTask(taskId);
			const volunteerP2 = taskManager2.volunteerForTask(taskId);
			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();
			await volunteerP1;
			await timeoutAwait(volunteerP2, {
				durationMs,
				reject: false,
				value: false,
			});

			taskManager1.complete(taskId);
			assert.equal(
				taskManager1.assigned(taskId),
				true,
				"taskManager1 should still be assigned",
			);
			assert.equal(
				taskManager2.assigned(taskId),
				false,
				"taskManager2 should still not be assigned",
			);

			containerRuntime1.rollback?.();

			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepEqual(
				[taskManager1.assigned(taskId), taskManager2.assigned(taskId), completedEvents1],
				[true, false, 0],
				"TaskManager1 should remain assigned with no completed events after complete rollback",
			);
		});

		it("Can rollback subscribe across remote ops", async () => {
			const {
				taskManager: taskManager1,
				containerRuntime: containerRuntime1,
				containerRuntimeFactory,
			} = setupRollbackTest();
			const { taskManager: taskManager2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			let assignedEvents1 = 0;
			let assignedEvents2 = 0;
			taskManager1.on("assigned", () => {
				assignedEvents1++;
			});
			taskManager2.on("assigned", () => {
				assignedEvents2++;
			});

			taskManager1.subscribeToTask(taskId);
			const volunteerP2 = taskManager2.volunteerForTask(taskId);

			containerRuntime1.rollback?.();

			containerRuntime1.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			const assigned2 = await timeoutAwait(volunteerP2, {
				durationMs,
				reject: false,
				value: false,
			});
			assert.equal(
				taskManager1.assigned(taskId),
				false,
				"taskManager1 should not be assigned post-rollback",
			);
			assert.equal(assigned2, true, "taskManager2 should be assigned post-rollback");

			assert.deepEqual(
				[
					taskManager1.assigned(taskId),
					taskManager1.queued(taskId),
					assignedEvents1,
					taskManager2.assigned(taskId),
					assignedEvents2,
				],
				[false, false, 0, true, 1],
				"TaskManager1 should be unassigned and taskManager2 should be assigned after volunteer rollback",
			);
		});
	});
});
