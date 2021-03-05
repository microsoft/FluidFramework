/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// import { IGCTestProvider, runGCTests } from "@fluid-internal/test-dds-utils";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
//     MockContainerRuntimeFactoryForReconnection,
//     MockContainerRuntimeForReconnection,
    MockStorage,
//     MockSharedObjectServices,
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

// function createCellForReconnection(id: string, runtimeFactory: MockContainerRuntimeFactoryForReconnection) {
//     const dataStoreRuntime = new MockFluidDataStoreRuntime();
//     const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
//     const services = {
//         deltaConnection: containerRuntime.createDeltaConnection(),
//         objectStorage: new MockStorage(),
//     };

//     const cell = new TaskQueue(id, dataStoreRuntime, TaskQueueFactory.Attributes);
//     cell.connect(services);
//     return { cell, containerRuntime };
// }

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

            // it("Can lock a task", async () => {
            //     const taskId = "taskId";
            //     const lockTaskP = taskManager.lockTask(taskId);
            //     assert.ok(taskManager.queued(taskId), "Not queued");
            //     await lockTaskP;
            //     assert.ok(!taskManager.queued(taskId), "Not queued");
            //     assert.ok(taskManager.haveTaskLock(taskId), "Don't have lock");
            // });

            // it("Can set and get cell data", () => {
            //     cell.set("testValue");
            //     assert.equal(cell.get(), "testValue", "Could not retrieve cell value");
            // });

            // it("can delete cell data", () => {
            //     cell.set("testValue");
            //     assert.equal(cell.get(), "testValue", "Could not retrieve cell value");

            //     cell.delete();
            //     assert.equal(cell.get(), undefined, "Could not delete cell value");
            // });

            // it("can load a SharedCell from snapshot", async () => {
            //     cell.set("testValue");
            //     assert.equal(cell.get(), "testValue", "Could not retrieve cell value");

            //     const services = MockSharedObjectServices.createFromSummary(cell.summarize().summary);
            //     const cell2 = new TaskQueue("cell2", new MockFluidDataStoreRuntime(), TaskQueueFactory.Attributes);
            //     await cell2.load(services);

            //     assert.equal(cell2.get(), "testValue", "Could not load SharedCell from snapshot");
            // });
        });
    });

    describe("Connected state", () => {
        let taskManager1: ITaskManager;
        let taskManager2: ITaskManager;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        describe("APIs", () => {
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

//             it("can delete cell data", () => {
//                 cell1.set("testValue");

//                 containerRuntimeFactory.processAllMessages();

//                 assert.equal(cell1.get(), "testValue", "Could not retrieve cell value");
//                 assert.equal(cell2.get(), "testValue", "Could not retrieve cell value from remote client");

//                 cell1.delete();

//                 containerRuntimeFactory.processAllMessages();

//                 assert.equal(cell1.get(), undefined, "Could not delete cell value");
//                 assert.equal(cell2.get(), undefined, "Could not delete cell value from remote client");
//             });
        });
    });

//     describe("Reconnection", () => {
//         let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
//         let containerRuntime1: MockContainerRuntimeForReconnection;
//         let containerRuntime2: MockContainerRuntimeForReconnection;
//         let cell1: ITaskManager;
//         let cell2: ITaskManager;

//         beforeEach(() => {
//             containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

//             // Connect the first SharedCell.
//             const response1 = createCellForReconnection("cell1", containerRuntimeFactory);
//             cell1 = response1.cell;
//             containerRuntime1 = response1.containerRuntime;

//             // Create a second SharedCell.
//             const response2 = createCellForReconnection("cell2", containerRuntimeFactory);
//             cell2 = response2.cell;
//             containerRuntime2 = response2.containerRuntime;
//         });

//         it("can resend unacked ops on reconnection", async () => {
//             const value = "testValue";

//             // Set a value on the first SharedCell.
//             cell1.set(value);

//             // Disconnect and reconnect the first client.
//             containerRuntime1.connected = false;
//             containerRuntime1.connected = true;

//             // Process the messages.
//             containerRuntimeFactory.processAllMessages();

//             // Verify that the set value is processed by both clients.
//             assert.equal(cell1.get(), value, "The first client did not process the set");
//             assert.equal(cell2.get(), value, "The second client did not process the set");

//             // Delete the value from the second SharedCell.
//             cell2.delete();

//             // Disconnect and reconnect the second client.
//             containerRuntime2.connected = false;
//             containerRuntime2.connected = true;

//             // Process the messages.
//             containerRuntimeFactory.processAllMessages();

//             // Verify that the deleted value is processed by both clients.
//             assert.equal(cell1.get(), undefined, "The first client did not process the delete");
//             assert.equal(cell2.get(), undefined, "The second client did not process the delete");
//         });

//         it("can store ops in disconnected state and resend them on reconnection", async () => {
//             const value = "testValue";

//             // Disconnect the first client.
//             containerRuntime1.connected = false;

//             // Set a value on the first SharedCell.
//             cell1.set(value);

//             // Reconnect the first client.
//             containerRuntime1.connected = true;

//             // Process the messages.
//             containerRuntimeFactory.processAllMessages();

//             // Verify that the set value is processed by both clients.
//             assert.equal(cell1.get(), value, "The first client did not process the set");
//             assert.equal(cell2.get(), value, "The second client did not process the set");

//             // Disconnect the second client.
//             containerRuntime2.connected = false;

//             // Delete the value from the second SharedCell.
//             cell2.delete();

//             // Reconnect the second client.
//             containerRuntime2.connected = true;

//             // Process the messages.
//             containerRuntimeFactory.processAllMessages();

//             // Verify that the deleted value is processed by both clients.
//             assert.equal(cell1.get(), undefined, "The first client did not process the delete");
//             assert.equal(cell2.get(), undefined, "The second client did not process the delete");
//         });
//     });
});
