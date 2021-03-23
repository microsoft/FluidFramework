/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { TaskManager } from "../taskManager";
import { TaskManagerFactory } from "../taskManagerFactory";
import { ITaskManager } from "../interfaces";

function createConnectedTaskManager(id: string, runtimeFactory: MockContainerRuntimeFactory) {
    // Create and connect a TaskManager.
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };

    const taskManager = new TaskManager(id, dataStoreRuntime, TaskManagerFactory.Attributes);
    taskManager.connect(services);
    return taskManager;
}

const createLocalTaskManager = (id: string) =>
    new TaskManager(id, new MockFluidDataStoreRuntime(), TaskManagerFactory.Attributes);

describe("TaskManager", () => {
    describe("Local state", () => {
        let taskManager: TaskManager;

        beforeEach(() => {
            taskManager = createLocalTaskManager("taskmanager");
        });

        describe("APIs", () => {
            it("Can create a TaskManager", () => {
                assert.ok(taskManager, "Could not create a task manager");
            });
        });
    });

    describe("Connected state", () => {
        let taskManager1: ITaskManager;
        let taskManager2: ITaskManager;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(() => {
            containerRuntimeFactory = new MockContainerRuntimeFactory();
            taskManager1 = createConnectedTaskManager("taskManager1", containerRuntimeFactory);
            taskManager2 = createConnectedTaskManager("taskManager2", containerRuntimeFactory);
        });

        it("Can lock a task", async () => {
            const taskId = "taskId";
            const lockTaskP = taskManager1.lockTask(taskId);
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            await lockTaskP;
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");
        });

        it("Can wait for a task", async () => {
            const taskId = "taskId";
            const lockTaskP1 = taskManager1.lockTask(taskId);
            const lockTaskP2 = taskManager2.lockTask(taskId);

            assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Task manager 1 should not have lock");
            assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
            assert.ok(!taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");

            containerRuntimeFactory.processAllMessages();
            await lockTaskP1;

            assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Task manager 1 does not have lock");
            assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
            assert.ok(!taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");

            taskManager1.abandon(taskId);
            containerRuntimeFactory.processAllMessages();
            await lockTaskP2;

            assert.ok(!taskManager1.queued(taskId), "Task manager 1 should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Task manager 1 should not have lock");
            assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
            assert.ok(taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");
        });

        it("Rejects the promise if abandon before ack", async () => {
            const taskId = "taskId";
            const lockTaskP = taskManager1.lockTask(taskId);
            taskManager1.abandon(taskId);
            // Will reject due to exiting the queue without first acquiring lock
            // Promise should be settled already prior to processing messages
            await assert.rejects(lockTaskP);
            containerRuntimeFactory.processAllMessages();
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
        });

        it("Rejects the promise if abandon after ack but before acquire", async () => {
            const taskId = "taskId";
            const lockTaskP1 = taskManager1.lockTask(taskId);
            const lockTaskP2 = taskManager2.lockTask(taskId);

            assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Task manager 1 should not have lock");
            assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
            assert.ok(!taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");

            containerRuntimeFactory.processAllMessages();
            await lockTaskP1;

            assert.ok(taskManager1.queued(taskId), "Task manager 1 should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Task manager 1 does not have lock");
            assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
            assert.ok(!taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");

            taskManager2.abandon(taskId);
            // Will reject due to exiting the queue without first acquiring lock
            // Promise should be settled already prior to processing messages
            await assert.rejects(lockTaskP2);
            containerRuntimeFactory.processAllMessages();
            assert.ok(!taskManager2.queued(taskId), "Should not be queued");
            assert.ok(!taskManager2.haveTaskLock(taskId), "Should not have lock");
        });

        it("Can abandon and immediately attempt to reacquire a task", async () => {
            const taskId = "taskId";
            const lockTaskP = taskManager1.lockTask(taskId);
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            await lockTaskP;
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");

            taskManager1.abandon(taskId);
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            const relockTaskP = taskManager1.lockTask(taskId);
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            await relockTaskP;
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");
        });

        it("Can attempt to lock twice and abandon twice (after ack)", async () => {
            const taskId = "taskId";
            const lockTaskP1 = taskManager1.lockTask(taskId);
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            await lockTaskP1;
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");

            const lockTaskP2 = taskManager1.lockTask(taskId);
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");
            containerRuntimeFactory.processAllMessages();
            await lockTaskP2;
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");

            taskManager1.abandon(taskId);
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");

            taskManager1.abandon(taskId);
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
        });

        it("Can attempt to lock twice and abandon twice (before ack)", async () => {
            const taskId = "taskId";
            const lockTaskP1 = taskManager1.lockTask(taskId);
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");

            const lockTaskP2 = taskManager1.lockTask(taskId);
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            await lockTaskP1;
            await lockTaskP2;
            assert.ok(taskManager1.queued(taskId), "Should be queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");

            taskManager1.abandon(taskId);
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            taskManager1.abandon(taskId);
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            assert.ok(!taskManager1.queued(taskId), "Should not be queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
        });
    });
});
