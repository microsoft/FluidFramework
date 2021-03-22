/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
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

    describe("Disconnection", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let taskManager1: TaskManager;
        let taskManager2: TaskManager;

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Create the first SharedMap.
            const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            taskManager1 = new TaskManager("task-manager-1", dataStoreRuntime1, TaskManagerFactory.Attributes);
            taskManager1.connect(services1);

            // Create the second TaskManager.
            const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
            const services2 = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            taskManager2 = new TaskManager("task-manager-2", dataStoreRuntime2, TaskManagerFactory.Attributes);
            taskManager2.connect(services2);
        });

        describe("Behavior transitioning to disconnect", () => {
            it("Disconnect while locked: Raises a lost event and loses the lock", async () => {
                const taskId = "taskId";
                const lockTaskP = taskManager1.lockTask(taskId);
                containerRuntimeFactory.processAllMessages();
                await lockTaskP;
                assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");

                let lostRaised = false;
                taskManager1.once("lost", () => { lostRaised = true; });

                containerRuntime1.connected = false;
                containerRuntimeFactory.processAllMessages();
                assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
                assert.ok(lostRaised, "Should have raised a lost event");
            });

            it("Disconnect while queued: Rejects the lock promise and exits the queue", async () => {
                const taskId = "taskId";
                let p2Rejected = false;
                const lockTaskP1 = taskManager1.lockTask(taskId);
                const lockTaskP2 = taskManager2.lockTask(taskId).catch(() => { p2Rejected = true; });
                containerRuntimeFactory.processAllMessages();
                await lockTaskP1;
                assert.ok(taskManager1.haveTaskLock(taskId), "Task manager 1 should have lock");
                assert.ok(taskManager2.queued(taskId), "Task manager 2 should be queued");
                assert.ok(!taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");

                containerRuntime2.connected = false;
                containerRuntimeFactory.processAllMessages();
                await lockTaskP2;
                assert.ok(!taskManager2.queued(taskId), "Task manager 2 should not be queued");
                assert.ok(!taskManager2.haveTaskLock(taskId), "Task manager 2 should not have lock");
                assert.ok(p2Rejected, "Should have rejected the P2 promise");
            });
            it("Disconnect while pending: Rejects the lock promise", async () => {
                const taskId = "taskId";
                let rejected = false;
                const lockTaskP = taskManager1.lockTask(taskId).catch(() => { rejected = true; });
                containerRuntime1.connected = false;
                containerRuntimeFactory.processAllMessages();
                await lockTaskP;
                assert.ok(!taskManager1.queued(taskId), "Should not be queued");
                assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
                assert.ok(rejected, "Should have rejected the promise");
            });
        });

        describe("Behavior while disconnected", () => {
            it.skip("Immediately rejects attempts to lock", async () => {
            });
        });

        describe("Behavior transitioning to connected", () => {
            it.skip("Does not resubmit", async () => {
            });
            it.skip("Ignores late acks", async () => {
            });
        });

        // it("can resend unacked ops on reconnection", async () => {
        //     const key = "testKey";
        //     const value = "testValue";

        //     // Set a value on the first SharedMap.
        //     taskManager1.set(key, value);

        //     // Disconnect and reconnect the first client.
        //     containerRuntime1.connected = false;
        //     containerRuntime1.connected = true;

        //     // Process the messages.
        //     containerRuntimeFactory.processAllMessages();

        //     // Verify that the set value is processed by both clients.
        //     assert.equal(taskManager1.get(key), value, "The local client did not process the set");
        //     assert.equal(taskManager2.get(key), value, "The remote client did not process the set");

        //     // Delete the value from the second SharedMap.
        //     taskManager2.delete(key);

        //     // Disconnect and reconnect the second client.
        //     containerRuntime2.connected = false;
        //     containerRuntime2.connected = true;

        //     // Process the messages.
        //     containerRuntimeFactory.processAllMessages();

        //     // Verify that the deleted value is processed by both clients.
        //     assert.equal(taskManager1.get(key), undefined, "The local client did not process the delete");
        //     assert.equal(taskManager2.get(key), undefined, "The remote client did not process the delete");
        // });

        // it("can store ops in disconnected state and resend them on reconnection", async () => {
        //     const key = "testKey";
        //     const value = "testValue";

        //     // Disconnect the first client.
        //     containerRuntime1.connected = false;

        //     // Set a value on the first SharedMap.
        //     taskManager1.set(key, value);

        //     // Reconnect the first client.
        //     containerRuntime1.connected = true;

        //     // Process the messages.
        //     containerRuntimeFactory.processAllMessages();

        //     // Verify that the set value is processed by both clients.
        //     assert.equal(taskManager1.get(key), value, "The local client did not process the set");
        //     assert.equal(taskManager2.get(key), value, "The remote client did not process the set");

        //     // Disconnect the second client.
        //     containerRuntime2.connected = false;

        //     // Delete the value from the second SharedMap.
        //     taskManager2.delete(key);

        //     // Reconnect the second client.
        //     containerRuntime2.connected = true;

        //     // Process the messages.
        //     containerRuntimeFactory.processAllMessages();

        //     // Verify that the deleted value is processed by both clients.
        //     assert.equal(taskManager1.get(key), undefined, "The local client did not process the delete");
        //     assert.equal(taskManager2.get(key), undefined, "The remote client did not process the delete");
        // });
    });
});
