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
    MockSharedObjectServices,
} from "@fluidframework/test-runtime-utils";
import { SharedCell } from "../cell";
import { CellFactory } from "../cellFactory";
import { ISharedCell } from "../interfaces";

describe("Cell", () => {
    let cell: SharedCell;
    let dataStoreRuntime: MockFluidDataStoreRuntime;

    beforeEach(async () => {
        dataStoreRuntime = new MockFluidDataStoreRuntime();
        cell = new SharedCell("cell", dataStoreRuntime, CellFactory.Attributes);
    });

    describe("SharedCell in local state", () => {
        beforeEach(() => {
            dataStoreRuntime.local = true;
        });

        it("Can create a cell", () => {
            assert.ok(cell, "Could not create a cell");
        });

        it("Can set and get cell data", () => {
            cell.set("testValue");
            assert.equal(cell.get(), "testValue", "Could not retrieve cell value");
        });

        it("can delete cell data", () => {
            cell.set("testValue");
            assert.equal(cell.get(), "testValue", "Could not retrieve cell value");

            cell.delete();
            assert.equal(cell.get(), undefined, "Could not delete cell value");
        });

        it("can load a SharedCell from snapshot", async () => {
            cell.set("testValue");
            assert.equal(cell.get(), "testValue", "Could not retrieve cell value");

            const services = MockSharedObjectServices.createFromSummary(cell.summarize().summary);
            const cell2 = new SharedCell("cell2", dataStoreRuntime, CellFactory.Attributes);
            await cell2.load(services);

            assert.equal(cell2.get(), "testValue", "Could not load SharedCell from snapshot");
        });
    });

    describe("SharedCell op processing in local state", () => {
        it("should correctly process a set operation sent in local state", async () => {
            // Set the dataStore runtime to local.
            dataStoreRuntime.local = true;

            // Set a value in local state.
            const value = "testValue";
            cell.set(value);

            // Load a new SharedCell in connected state from the snapshot of the first one.
            const containerRuntimeFactory = new MockContainerRuntimeFactory();
            const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
            const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
            const services2 = MockSharedObjectServices.createFromSummary(cell.summarize().summary);
            services2.deltaConnection = containerRuntime2.createDeltaConnection();

            const cell2 = new SharedCell("cell2", dataStoreRuntime2, CellFactory.Attributes);
            await cell2.load(services2);

            // Now connect the first SharedCell
            dataStoreRuntime.local = false;
            const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(undefined),
            };
            cell.connect(services1);

            // Verify that both the cells have the value.
            assert.equal(cell.get(), value, "The first cell does not have the key");
            assert.equal(cell2.get(), value, "The second cell does not have the key");

            // Set a new value in the second SharedCell.
            const newValue = "newvalue";
            cell2.set(newValue);

            // Process the message.
            containerRuntimeFactory.processAllMessages();

            // Verify that both the cells have the new value.
            assert.equal(cell.get(), newValue, "The first cell did not get the new value");
            assert.equal(cell2.get(), newValue, "The second cell did not get the new value");
        });
    });

    describe("SharedCell in connected state with a remote SharedCell", () => {
        let cell2: ISharedCell;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(() => {
            containerRuntimeFactory = new MockContainerRuntimeFactory();

            // Connect the first SharedCell.
            dataStoreRuntime.local = false;
            const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            cell.connect(services1);

            // Create and connect a second SharedCell.
            const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
            const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
            const services2 = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };

            cell2 = new SharedCell("cell2", dataStoreRuntime2, CellFactory.Attributes);
            cell2.connect(services2);
        });

        describe("SharedCell APIs", () => {
            it("Can set and get cell data", () => {
                cell.set("testValue");

                containerRuntimeFactory.processAllMessages();

                assert.equal(cell.get(), "testValue", "Could not retrieve cell value");
                assert.equal(cell2.get(), "testValue", "Could not retrieve cell value from remote client");
            });

            it("can delete cell data", () => {
                cell.set("testValue");

                containerRuntimeFactory.processAllMessages();

                assert.equal(cell.get(), "testValue", "Could not retrieve cell value");
                assert.equal(cell2.get(), "testValue", "Could not retrieve cell value from remote client");

                cell.delete();

                containerRuntimeFactory.processAllMessages();

                assert.equal(cell.get(), undefined, "Could not delete cell value");
                assert.equal(cell2.get(), undefined, "Could not delete cell value from remote client");
            });
        });

        describe("Garbage Collection", () => {
            it("can generate GC nodes with handles in data", () => {
                const factory = new CellFactory();
                const subCell = factory.create(dataStoreRuntime, "subCell");
                cell.set(subCell.handle);

                containerRuntimeFactory.processAllMessages();

                // Verify the GC nodes returned by summarize.
                const gcNodes = cell2.summarize().gcNodes;
                assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
                assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
                assert.deepStrictEqual(
                    gcNodes[0].outboundRoutes,
                    [subCell.handle.absolutePath],
                    "GC node's outbound routes is incorrect");
            });

            it("can generate GC nodes when handles are removed from data", () => {
                const factory = new CellFactory();
                const subCell = factory.create(dataStoreRuntime, "subCell");
                cell.set(subCell.handle);

                containerRuntimeFactory.processAllMessages();

                // Verify the GC nodes returned by summarize.
                let gcNodes = cell2.summarize().gcNodes;
                assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
                assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
                assert.deepStrictEqual(
                    gcNodes[0].outboundRoutes,
                    [subCell.handle.absolutePath],
                    "GC node's outbound routes is incorrect");

                // Verify that removed handle updates GC node's routes correctly.
                cell.delete();
                containerRuntimeFactory.processAllMessages();

                gcNodes = cell2.summarize().gcNodes;
                assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
                assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
                assert.deepStrictEqual(
                    gcNodes[0].outboundRoutes,
                    [],
                    "GC node's outbound routes should now be empty");
            });

            it("can generate GC nodes when handles are added to data", () => {
                const factory = new CellFactory();
                const subCell = factory.create(dataStoreRuntime, "subCell");
                cell.set(subCell.handle);

                containerRuntimeFactory.processAllMessages();

                // Verify the GC nodes returned by summarize.
                let gcNodes = cell2.summarize().gcNodes;
                assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
                assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
                assert.deepStrictEqual(
                    gcNodes[0].outboundRoutes,
                    [subCell.handle.absolutePath],
                    "GC node's outbound routes is incorrect");

                // Verify that new handle updates GC node's routes correctly.
                const subCell2 = factory.create(dataStoreRuntime, "subCell2");
                cell.set(subCell2.handle);
                containerRuntimeFactory.processAllMessages();

                gcNodes = cell2.summarize().gcNodes;
                assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
                assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
                assert.deepStrictEqual(
                    gcNodes[0].outboundRoutes,
                    [subCell2.handle.absolutePath],
                    "GC node's outbound routes should have updated handle route");
            });

            it("can generate GC nodes with nested handles in data", () => {
                const factory = new CellFactory();
                const subCell = factory.create(dataStoreRuntime, "subCell");
                const subCell2 = factory.create(dataStoreRuntime, "subCell2");
                const containingObject = {
                    subcellHandle: subCell.handle,
                    nestedObj: {
                        subcell2Handle: subCell2.handle,
                    },
                };
                cell.set(containingObject);

                containerRuntimeFactory.processAllMessages();

                // Verify the GC nodes returned by summarize.
                const gcNodes = cell2.summarize().gcNodes;
                assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
                assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
                assert.deepStrictEqual(
                    gcNodes[0].outboundRoutes,
                    [subCell.handle.absolutePath, subCell2.handle.absolutePath],
                    "GC node's outbound routes is incorrect");
            });
        });
    });

    describe("SharedCell reconnection flow", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let cell2: ISharedCell;

        beforeEach(() => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Connect the first SharedCell.
            dataStoreRuntime.local = false;
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            cell.connect(services1);

            // Create and connect a second SharedCell.
            const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
            const services2 = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };

            cell2 = new SharedCell("cell2", dataStoreRuntime2, CellFactory.Attributes);
            cell2.connect(services2);
        });

        it("can resend unacked ops on reconnection", async () => {
            const value = "testValue";

            // Set a value on the first SharedCell.
            cell.set(value);

            // Disconnect and reconnect the first client.
            containerRuntime1.connected = false;
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the set value is processed by both clients.
            assert.equal(cell.get(), value, "The first client did not process the set");
            assert.equal(cell2.get(), value, "The second client did not process the set");

            // Delete the value from the second SharedCell.
            cell2.delete();

            // Disconnect and reconnect the second client.
            containerRuntime2.connected = false;
            containerRuntime2.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the deleted value is processed by both clients.
            assert.equal(cell.get(), undefined, "The first client did not process the delete");
            assert.equal(cell2.get(), undefined, "The second client did not process the delete");
        });

        it("can store ops in disconnected state and resend them on reconnection", async () => {
            const value = "testValue";

            // Disconnect the first client.
            containerRuntime1.connected = false;

            // Set a value on the first SharedCell.
            cell.set(value);

            // Reconnect the first client.
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the set value is processed by both clients.
            assert.equal(cell.get(), value, "The first client did not process the set");
            assert.equal(cell2.get(), value, "The second client did not process the set");

            // Disconnect the second client.
            containerRuntime2.connected = false;

            // Delete the value from the second SharedCell.
            cell2.delete();

            // Reconnect the second client.
            containerRuntime2.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the deleted value is processed by both clients.
            assert.equal(cell.get(), undefined, "The first client did not process the delete");
            assert.equal(cell2.get(), undefined, "The second client did not process the delete");
        });
    });
});
