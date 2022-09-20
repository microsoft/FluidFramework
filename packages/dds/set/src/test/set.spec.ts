/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IGCTestProvider, runGCTests } from "@fluid-internal/test-dds-utils";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockStorage,
    MockSharedObjectServices,
} from "@fluidframework/test-runtime-utils";
import { SharedSet } from "../set";
import { SetFactory } from "../setFactory";
import { ISharedSet } from "../interfaces";

function createConnectedSet(id: string, runtimeFactory: MockContainerRuntimeFactory) {
    // Create and connect a second SharedSet.
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };

    const set = new SharedSet(id, dataStoreRuntime, SetFactory.Attributes);
    set.connect(services);
    return set;
}

function createLocalSet(id: string) {
    const subSet = new SharedSet("set", new MockFluidDataStoreRuntime(), SetFactory.Attributes);
    return subSet;
}

function createSetForReconnection(id: string, runtimeFactory: MockContainerRuntimeFactoryForReconnection) {
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };

    const set = new SharedSet(id, dataStoreRuntime, SetFactory.Attributes);
    set.connect(services);
    return { set, containerRuntime };
}

describe("Set", () => {
    describe("Local state", () => {
        let set: SharedSet;

        beforeEach(() => {
            set = createLocalSet("set");
        });

        describe("APIs", () => {
            it("Can create a set", () => {
                assert.ok(set, "Could not create a set");
            });

            it("Can set and get set data", () => {
                set.set("testValue");
                assert.equal(set.get(), "testValue", "Could not retrieve set value");
            });

            it("can delete set data", () => {
                set.set("testValue");
                assert.equal(set.get(), "testValue", "Could not retrieve set value");

                set.delete();
                assert.equal(set.get(), undefined, "Could not delete set value");
            });

            it("can load a SharedSet from snapshot", async () => {
                set.set("testValue");
                assert.equal(set.get(), "testValue", "Could not retrieve set value");

                const services = MockSharedObjectServices.createFromSummary(set.getAttachSummary().summary);
                const set2 = new SharedSet("set2", new MockFluidDataStoreRuntime(), SetFactory.Attributes);
                await set2.load(services);

                assert.equal(set2.get(), "testValue", "Could not load SharedSet from snapshot");
            });

            it("can load a SharedSet with undefined value from snapshot", async () => {
                const services = MockSharedObjectServices.createFromSummary(set.getAttachSummary().summary);
                const set2 = new SharedSet("set2", new MockFluidDataStoreRuntime(), SetFactory.Attributes);
                await set2.load(services);

                assert.equal(set2.get(), undefined, "Could not load SharedSet from snapshot");
            });
        });

        describe("Op processing in local state", () => {
             it("should correctly process a set operation sent in local state", async () => {
                const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
                const set1 = new SharedSet("set1", dataStoreRuntime1, SetFactory.Attributes);
                // Set a value in local state.
                const value = "testValue";
                set1.set(value);

                // Load a new SharedSet in connected state from the snapshot of the first one.
                const containerRuntimeFactory = new MockContainerRuntimeFactory();
                const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
                const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
                const services2 = MockSharedObjectServices.createFromSummary(set1.getAttachSummary().summary);
                services2.deltaConnection = containerRuntime2.createDeltaConnection();

                const set2 = new SharedSet("set2", dataStoreRuntime2, SetFactory.Attributes);
                await set2.load(services2);

                // Now connect the first SharedSet
                dataStoreRuntime1.local = false;
                const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
                const services1 = {
                    deltaConnection: containerRuntime1.createDeltaConnection(),
                    objectStorage: new MockStorage(),
                };
                set1.connect(services1);

                // Verify that both the sets have the value.
                assert.equal(set1.get(), value, "The first set does not have the key");
                assert.equal(set2.get(), value, "The second set does not have the key");

                // Set a new value in the second SharedSet.
                const newValue = "newvalue";
                set2.set(newValue);

                // Process the message.
                containerRuntimeFactory.processAllMessages();

                // Verify that both the sets have the new value.
                assert.equal(set1.get(), newValue, "The first set did not get the new value");
                assert.equal(set2.get(), newValue, "The second set did not get the new value");
            });
        });
    });

    describe("Connected state", () => {
        let set1: ISharedSet;
        let set2: ISharedSet;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        describe("APIs", () => {
            beforeEach(() => {
                containerRuntimeFactory = new MockContainerRuntimeFactory();
                // Connect the first SharedSet.
                set1 = createConnectedSet("set1", containerRuntimeFactory);
                // Create a second SharedSet.
                set2 = createConnectedSet("set2", containerRuntimeFactory);
            });

            it("Can set and get set data", () => {
                set1.set("testValue");

                containerRuntimeFactory.processAllMessages();

                assert.equal(set1.get(), "testValue", "Could not retrieve set value");
                assert.equal(set2.get(), "testValue", "Could not retrieve set value from remote client");
            });

            it("can delete set data", () => {
                set1.set("testValue");

                containerRuntimeFactory.processAllMessages();

                assert.equal(set1.get(), "testValue", "Could not retrieve set value");
                assert.equal(set2.get(), "testValue", "Could not retrieve set value from remote client");

                set1.delete();

                containerRuntimeFactory.processAllMessages();

                assert.equal(set1.get(), undefined, "Could not delete set value");
                assert.equal(set2.get(), undefined, "Could not delete set value from remote client");
            });
        });
    });

    describe("Reconnection", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let set1: ISharedSet;
        let set2: ISharedSet;

        beforeEach(() => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Connect the first SharedSet.
            const response1 = createSetForReconnection("set1", containerRuntimeFactory);
            set1 = response1.set;
            containerRuntime1 = response1.containerRuntime;

            // Create a second SharedSet.
            const response2 = createSetForReconnection("set2", containerRuntimeFactory);
            set2 = response2.set;
            containerRuntime2 = response2.containerRuntime;
        });

        it("can resend unacked ops on reconnection", async () => {
            const value = "testValue";

            // Set a value on the first SharedSet.
            set1.set(value);

            // Disconnect and reconnect the first client.
            containerRuntime1.connected = false;
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the set value is processed by both clients.
            assert.equal(set1.get(), value, "The first client did not process the set");
            assert.equal(set2.get(), value, "The second client did not process the set");

            // Delete the value from the second SharedSet.
            set2.delete();

            // Disconnect and reconnect the second client.
            containerRuntime2.connected = false;
            containerRuntime2.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the deleted value is processed by both clients.
            assert.equal(set1.get(), undefined, "The first client did not process the delete");
            assert.equal(set2.get(), undefined, "The second client did not process the delete");
        });

        it("can store ops in disconnected state and resend them on reconnection", async () => {
            const value = "testValue";

            // Disconnect the first client.
            containerRuntime1.connected = false;

            // Set a value on the first SharedSet.
            set1.set(value);

            // Reconnect the first client.
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the set value is processed by both clients.
            assert.equal(set1.get(), value, "The first client did not process the set");
            assert.equal(set2.get(), value, "The second client did not process the set");

            // Disconnect the second client.
            containerRuntime2.connected = false;

            // Delete the value from the second SharedSet.
            set2.delete();

            // Reconnect the second client.
            containerRuntime2.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the deleted value is processed by both clients.
            assert.equal(set1.get(), undefined, "The first client did not process the delete");
            assert.equal(set2.get(), undefined, "The second client did not process the delete");
        });
    });

    describe("Garbage Collection", () => {
        class GCSharedSetProvider implements IGCTestProvider {
            private subSetCount = 0;
            private _expectedRoutes: string[] = [];
            private readonly set1: ISharedSet;
            private readonly set2: ISharedSet;
            private readonly containerRuntimeFactory: MockContainerRuntimeFactory;

            constructor() {
                this.containerRuntimeFactory = new MockContainerRuntimeFactory();
                this.set1 = createConnectedSet("set1", this.containerRuntimeFactory);
                this.set2 = createConnectedSet("set2", this.containerRuntimeFactory);
            }

            public get sharedObject() {
                // Return the remote SharedSet because we want to verify its summary data.
                return this.set2;
            }

            public get expectedOutboundRoutes() {
                return this._expectedRoutes;
            }

            public async addOutboundRoutes() {
                const newSubSet = createLocalSet(`subSet-${++this.subSetCount}`);
                this.set1.set(newSubSet.handle);
                this._expectedRoutes = [newSubSet.handle.absolutePath];
                this.containerRuntimeFactory.processAllMessages();
            }

            public async deleteOutboundRoutes() {
                this.set2.delete();
                this._expectedRoutes = [];
                this.containerRuntimeFactory.processAllMessages();
            }

            public async addNestedHandles() {
                const newSubSet = createLocalSet(`subSet-${++this.subSetCount}`);
                const newSubSet2 = createLocalSet(`subSet-${++this.subSetCount}`);
                const containingObject = {
                    subsetHandle: newSubSet.handle,
                    nestedObj: {
                        subset2Handle: newSubSet2.handle,
                    },
                };
                this.set1.set(containingObject);
                this._expectedRoutes = [newSubSet.handle.absolutePath, newSubSet2.handle.absolutePath];
                this.containerRuntimeFactory.processAllMessages();
            }
        }

        runGCTests(GCSharedSetProvider);
    });
});
