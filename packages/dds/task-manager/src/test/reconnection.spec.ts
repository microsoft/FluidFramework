/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { TaskManager } from "../taskManager";
import { TaskManagerFactory } from "../taskManagerFactory";

describe("Reconnection", () => {
    describe("TaskManager", () => {
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

        it("Disconnect while locked: Raises a lost event and loses the lock", async () => {
            const taskId = "taskId";
            const lockTaskP = taskManager1.lockTask(taskId);
            containerRuntimeFactory.processAllMessages();
            await lockTaskP;
            assert.ok(taskManager1.haveTaskLock(taskId), "Should have lock");

            containerRuntime1.connected = false;
            containerRuntimeFactory.processAllMessages();
            assert.ok(!taskManager1.haveTaskLock(taskId), "Should not have lock");
        });
        it("Disconnect while queued: Rejects the lock promise and exits the queue", async () => {
        });
        it("Disconnect while pending: Rejects the lock promise and treats the ack as a remote client", async () => {
        });
        it("Does nothing on reconnect", async () => {
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
