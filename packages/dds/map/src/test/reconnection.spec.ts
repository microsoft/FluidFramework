/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { MapFactory, SharedMap } from "../map";
import { DirectoryFactory, SharedDirectory } from "../directory";

describe("Reconnection", () => {
    describe("SharedMap", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let map1: SharedMap;
        let map2: SharedMap;

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Create the first SharedMap.
            const componentRuntime1 = new MockFluidDataStoreRuntime();
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(componentRuntime1);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            map1 = new SharedMap("shared-map-1", componentRuntime1, MapFactory.Attributes);
            map1.connect(services1);

            // Create the second SharedMap.
            const componentRuntime2 = new MockFluidDataStoreRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2 = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            map2 = new SharedMap("shared-map-2", componentRuntime2, MapFactory.Attributes);
            map2.connect(services2);
        });

        it("can resend unacked ops on reconnection", async () => {
            const key = "testKey";
            const value = "testValue";

            // Set a value on the first SharedMap.
            map1.set(key, value);

            // Disconnect and reconnect the first client.
            containerRuntime1.connected = false;
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the set value is processed by both clients.
            assert.equal(map1.get(key), value, "The local client did not process the set");
            assert.equal(map2.get(key), value, "The remote client did not process the set");

            // Delete the value from the second SharedMap.
            map2.delete(key);

            // Disconnect and reconnect the second client.
            containerRuntime2.connected = false;
            containerRuntime2.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the deleted value is processed by both clients.
            assert.equal(map1.get(key), undefined, "The local client did not process the delete");
            assert.equal(map2.get(key), undefined, "The remote client did not process the delete");
        });

        it("can store ops in disconnected state and resend them on reconnection", async () => {
            const key = "testKey";
            const value = "testValue";

            // Disconnect the first client.
            containerRuntime1.connected = false;

            // Set a value on the first SharedMap.
            map1.set(key, value);

            // Reconnect the first client.
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the set value is processed by both clients.
            assert.equal(map1.get(key), value, "The local client did not process the set");
            assert.equal(map2.get(key), value, "The remote client did not process the set");

            // Disconnect the second client.
            containerRuntime2.connected = false;

            // Delete the value from the second SharedMap.
            map2.delete(key);

            // Reconnect the second client.
            containerRuntime2.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the deleted value is processed by both clients.
            assert.equal(map1.get(key), undefined, "The local client did not process the delete");
            assert.equal(map2.get(key), undefined, "The remote client did not process the delete");
        });
    });

    describe("SharedDirectory", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let directory1: SharedDirectory;
        let directory2: SharedDirectory;

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Create the first SharedDirectory.
            const componentRuntime1 = new MockFluidDataStoreRuntime();
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(componentRuntime1);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            directory1 = new SharedDirectory("shared-directory-1", componentRuntime1, DirectoryFactory.Attributes);
            directory1.connect(services1);

            // Create the second SharedDirectory.
            const componentRuntime2 = new MockFluidDataStoreRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2 = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            directory2 = new SharedDirectory("shared-directory-2", componentRuntime2, DirectoryFactory.Attributes);
            directory2.connect(services2);
        });

        it("can resend unacked ops on reconnection", async () => {
            const key = "testKey";
            const value = "testValue";
            const subDirName = "subDir";
            const subDirKey = "testSubDirKey";
            const subDirValue = "testSubDirValue";

            // Set a value on the first SharedDirectory.
            directory1.set(key, value);
            // Create a subdirectory and set a value on it.
            const subDir = directory1.createSubDirectory(subDirName);
            subDir.set(subDirKey, subDirValue);

            // Disconnect and reconnect the first client.
            containerRuntime1.connected = false;
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the ops are processed by both clients.
            assert.equal(directory1.get(key), value, "The local client did not process the set");
            assert.equal(directory2.get(key), value, "The remote client did not process the set");

            const subDir1 = directory1.getSubDirectory(subDirName);
            assert.ok(subDir1);
            assert.equal(subDir1.get(subDirKey), subDirValue);

            const subDir2 = directory2.getSubDirectory(subDirName);
            assert.ok(subDir2);
            assert.equal(subDir2.get(subDirKey), subDirValue);

            // Delete the sub directory from the second SharedDirectory.
            directory2.deleteSubDirectory(subDirName);

            // Disconnect and reconnect the second client.
            containerRuntime2.connected = false;
            containerRuntime2.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the delete is processed by both clients.
            assert.equal(
                directory1.getSubDirectory(subDirName), undefined, "The local client did not delete sub directory");
            assert.equal(
                directory2.getSubDirectory(subDirName), undefined, "The remote client did not delete sub directory");
        });

        it("can store ops in disconnected state and resend them on reconnection", async () => {
            const key = "testKey";
            const value = "testValue";
            const subDirName = "subDir";
            const subDirKey = "testSubDirKey";
            const subDirValue = "testSubDirValue";

            // Disconnect the first client.
            containerRuntime1.connected = false;

            // Set a value on the first SharedDirectory.
            directory1.set(key, value);
            // Create a subdirectory and set a value on it.
            const subDir = directory1.createSubDirectory(subDirName);
            subDir.set(subDirKey, subDirValue);

            // Reconnect the first client.
            containerRuntime1.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the ops are processed by both clients.
            assert.equal(directory1.get(key), value, "The local client did not process the set");
            assert.equal(directory2.get(key), value, "The remote client did not process the set");

            const subDir1 = directory1.getSubDirectory(subDirName);
            assert.ok(subDir1);
            assert.equal(subDir1.get(subDirKey), subDirValue);

            const subDir2 = directory2.getSubDirectory(subDirName);
            assert.ok(subDir2);
            assert.equal(subDir2.get(subDirKey), subDirValue);

            // Disconnect the second client.
            containerRuntime2.connected = false;

            // Delete the sub directory from the second SharedDirectory.
            directory2.deleteSubDirectory(subDirName);

            // Reconnect the second client.
            containerRuntime2.connected = true;

            // Process the messages.
            containerRuntimeFactory.processAllMessages();

            // Verify that the delete is processed by both clients.
            assert.equal(
                directory1.getSubDirectory(subDirName), undefined, "The local client did not delete sub directory");
            assert.equal(
                directory2.getSubDirectory(subDirName), undefined, "The remote client did not delete sub directory");
        });
    });
});
