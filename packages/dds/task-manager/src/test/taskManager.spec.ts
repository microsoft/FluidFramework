/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// import { IGCTestProvider, runGCTests } from "@fluid-internal/test-dds-utils";
import {
    MockFluidDataStoreRuntime,
//     MockContainerRuntimeFactory,
//     MockContainerRuntimeFactoryForReconnection,
//     MockContainerRuntimeForReconnection,
//     MockStorage,
//     MockSharedObjectServices,
} from "@fluidframework/test-runtime-utils";
import { TaskManager } from "../taskManager";
import { TaskManagerFactory } from "../taskManagerFactory";
// import { ITaskQueue } from "../interfaces";

// function createConnectedCell(id: string, runtimeFactory: MockContainerRuntimeFactory) {
//     // Create and connect a second SharedCell.
//     const dataStoreRuntime = new MockFluidDataStoreRuntime();
//     const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
//     const services = {
//         deltaConnection: containerRuntime.createDeltaConnection(),
//         objectStorage: new MockStorage(),
//     };

//     const cell = new TaskQueue(id, dataStoreRuntime, TaskQueueFactory.Attributes);
//     cell.connect(services);
//     return cell;
// }

function createLocalTaskManager(id: string) {
    const subCell = new TaskManager(id, new MockFluidDataStoreRuntime(), TaskManagerFactory.Attributes);
    return subCell;
}

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

//         describe("Op processing in local state", () => {
//              it("should correctly process a set operation sent in local state", async () => {
//                 const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
//                 const cell1 = new TaskQueue("cell1", dataStoreRuntime1, TaskQueueFactory.Attributes);
//                 // Set a value in local state.
//                 const value = "testValue";
//                 cell1.set(value);

//                 // Load a new SharedCell in connected state from the snapshot of the first one.
//                 const containerRuntimeFactory = new MockContainerRuntimeFactory();
//                 const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
//                 const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
//                 const services2 = MockSharedObjectServices.createFromSummary(cell1.summarize().summary);
//                 services2.deltaConnection = containerRuntime2.createDeltaConnection();

//                 const cell2 = new TaskQueue("cell2", dataStoreRuntime2, TaskQueueFactory.Attributes);
//                 await cell2.load(services2);

//                 // Now connect the first SharedCell
//                 dataStoreRuntime1.local = false;
//                 const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
//                 const services1 = {
//                     deltaConnection: containerRuntime1.createDeltaConnection(),
//                     objectStorage: new MockStorage(),
//                 };
//                 cell1.connect(services1);

//                 // Verify that both the cells have the value.
//                 assert.equal(cell1.get(), value, "The first cell does not have the key");
//                 assert.equal(cell2.get(), value, "The second cell does not have the key");

//                 // Set a new value in the second SharedCell.
//                 const newValue = "newvalue";
//                 cell2.set(newValue);

//                 // Process the message.
//                 containerRuntimeFactory.processAllMessages();

//                 // Verify that both the cells have the new value.
//                 assert.equal(cell1.get(), newValue, "The first cell did not get the new value");
//                 assert.equal(cell2.get(), newValue, "The second cell did not get the new value");
//             });
//         });
    });

//     describe("Connected state", () => {
//         let cell1: ITaskQueue;
//         let cell2: ITaskQueue;
//         let containerRuntimeFactory: MockContainerRuntimeFactory;

//         describe("APIs", () => {
//             beforeEach(() => {
//                 containerRuntimeFactory = new MockContainerRuntimeFactory();
//                 // Connect the first SharedCell.
//                 cell1 = createConnectedCell("cell1", containerRuntimeFactory);
//                 // Create a second SharedCell.
//                 cell2 = createConnectedCell("cell2", containerRuntimeFactory);
//             });

//             it("Can set and get cell data", () => {
//                 cell1.set("testValue");

//                 containerRuntimeFactory.processAllMessages();

//                 assert.equal(cell1.get(), "testValue", "Could not retrieve cell value");
//                 assert.equal(cell2.get(), "testValue", "Could not retrieve cell value from remote client");
//             });

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
//         });
//     });

//     describe("Reconnection", () => {
//         let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
//         let containerRuntime1: MockContainerRuntimeForReconnection;
//         let containerRuntime2: MockContainerRuntimeForReconnection;
//         let cell1: ITaskQueue;
//         let cell2: ITaskQueue;

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
