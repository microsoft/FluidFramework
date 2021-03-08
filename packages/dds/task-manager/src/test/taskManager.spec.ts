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
            assert.ok(taskManager1.queued(taskId), "Not queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
            containerRuntimeFactory.processAllMessages();
            await lockTaskP;
            assert.ok(taskManager1.queued(taskId), "Not queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Don't have lock");
        });

        it("Can wait for a task", async () => {
            const taskId = "taskId";
            const lockTaskP1 = taskManager1.lockTask(taskId);
            const lockTaskP2 = taskManager2.lockTask(taskId);

            assert.ok(taskManager1.queued(taskId), "Task manager 1 not queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Task manager 1 should not have lock");
            assert.ok(taskManager2.queued(taskId), "Task manager 2 not queued");
            assert.ok(!taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");

            containerRuntimeFactory.processAllMessages();
            await lockTaskP1;

            assert.ok(taskManager1.queued(taskId), "Task manager 1 not queued");
            assert.ok(taskManager1.haveTaskLock(taskId), "Task manager 1 does not have lock");
            assert.ok(taskManager2.queued(taskId), "Task manager 2 not queued");
            assert.ok(!taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");

            taskManager1.abandon(taskId);
            containerRuntimeFactory.processAllMessages();
            await lockTaskP2;

            assert.ok(!taskManager1.queued(taskId), "Task manager 1 not queued");
            assert.ok(!taskManager1.haveTaskLock(taskId), "Task manager 1 should not have lock");
            assert.ok(taskManager2.queued(taskId), "Task manager 2 not queued");
            assert.ok(taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");
        });
    });
});
