/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { DirectoryFactory, SharedDirectory } from "../../directory.js";
import { MapFactory, SharedMap } from "../../map.js";
import { assertEquivalentDirectories } from "./directoryEquivalenceUtils.js";

describe("Reconnection", () => {
	describe("SharedMap", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let map1: SharedMap;
		let map2: SharedMap;

		beforeEach("createMaps", async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Create the first SharedMap.
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			map1 = new SharedMap("shared-map-1", dataStoreRuntime1, MapFactory.Attributes);
			map1.connect(services1);

			// Create the second SharedMap.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			map2 = new SharedMap("shared-map-2", dataStoreRuntime2, MapFactory.Attributes);
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

		beforeEach("createDirectories", async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Create the first SharedDirectory.
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			directory1 = new SharedDirectory(
				"shared-directory-1",
				dataStoreRuntime1,
				DirectoryFactory.Attributes,
			);
			directory1.connect(services1);

			// Create the second SharedDirectory.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			directory2 = new SharedDirectory(
				"shared-directory-2",
				dataStoreRuntime2,
				DirectoryFactory.Attributes,
			);
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
				directory1.getSubDirectory(subDirName),
				undefined,
				"The local client did not delete sub directory",
			);
			assert.equal(
				directory2.getSubDirectory(subDirName),
				undefined,
				"The remote client did not delete sub directory",
			);
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
				directory1.getSubDirectory(subDirName),
				undefined,
				"The local client did not delete sub directory",
			);
			assert.equal(
				directory2.getSubDirectory(subDirName),
				undefined,
				"The remote client did not delete sub directory",
			);
		});

		it("avoids resending createSubDirectory ops on recreated directories", async () => {
			const subDirName = "subDir";

			const subDir1 = directory1.createSubDirectory(subDirName);
			containerRuntimeFactory.processAllMessages();

			// This op will not be submitted first as we are going to disconnect the client.
			subDir1.createSubDirectory(subDirName);
			containerRuntime1.connected = false;

			directory2.deleteSubDirectory(subDirName);
			directory2.createSubDirectory(subDirName);
			containerRuntimeFactory.processAllMessages();
			// Now client1 reconnects causing it to delete the /subDir, so that the create /subDir/subDir will not be submitted
			containerRuntime1.connected = true;

			containerRuntimeFactory.processAllMessages();
			assert(directory1.getSubDirectory(subDirName) !== undefined, "/subDir should exist");
			assert(
				directory1.getSubDirectory(subDirName)?.getSubDirectory(subDirName) === undefined,
				"/subDir/subDir should not exist",
			);
			assertEquivalentDirectories(directory1, directory2);
		});

		it("avoids sending setValue ops on recreated directories", async () => {
			const subDirName = "subDir";
			const subDirKey = "testSubDirKey";
			const subDirValue = "testSubDirValue";

			const subDir1 = directory1.createSubDirectory(subDirName);
			containerRuntimeFactory.processAllMessages();

			// This op will not be submitted first as we are going to disconnect the client.
			subDir1.set(subDirKey, subDirValue);
			containerRuntime1.connected = false;

			directory2.deleteSubDirectory(subDirName);
			directory2.createSubDirectory(subDirName);
			containerRuntimeFactory.processAllMessages();
			// Now client1 reconnects causing it to delete the /subDir, so that the set /subDir/testSubDirKey will not be submitted.
			containerRuntime1.connected = true;

			containerRuntimeFactory.processAllMessages();
			assert(directory1.getSubDirectory(subDirName) !== undefined, "/subDir should exist");
			assert(
				directory1.getSubDirectory(subDirName)?.get(subDirKey) === undefined,
				"/subDir(testSubDirKey) should not exist",
			);
			assertEquivalentDirectories(directory1, directory2);
		});

		it("does not delete pending create subDirs on reconnection", async () => {
			const subDirName1 = "subDir";
			const subDirName2 = "subDir2";

			containerRuntime1.connected = false;
			// These ops will not be sent initially as we are in disconnected state.
			const subDir = directory1.createSubDirectory(subDirName1);
			subDir.createSubDirectory(subDirName1);

			const subDir1 = directory2.createSubDirectory(subDirName1);
			subDir1.createSubDirectory(subDirName2);
			// /subDir deleted by other connected client.
			directory2.deleteSubDirectory(subDirName1);
			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = true;

			// When op for deleting /subDir comes, it will not delete subdirectories who are created locally and
			// ack is pending as they will recreated again. Both directories will contain /subDir/subDir but
			// no /subDir/subDir2.
			containerRuntimeFactory.processAllMessages();
			assert(directory1.getSubDirectory(subDirName1) !== undefined, "/subDir should exist");
			assert(
				directory1.getSubDirectory(subDirName1)?.getSubDirectory(subDirName1) !== undefined,
				"/subDir/subDir should exist",
			);
			assert(
				directory1.getSubDirectory(subDirName1)?.getSubDirectory(subDirName2) === undefined,
				"/subDir/subDir2 should not exist",
			);

			assertEquivalentDirectories(directory1, directory2);
		});

		it("does not delete pending keys within pending subDirs on reconnection", async () => {
			const subDirName = "subDir";
			const subDirKey = "testSubDirKey";
			const subDirValue = "testSubDirValue";

			containerRuntime1.connected = false;
			const subDir = directory1.createSubDirectory(subDirName);
			const subDir2 = subDir.createSubDirectory(subDirName);
			subDir2.set(subDirKey, subDirValue);

			directory2.createSubDirectory(subDirName);
			directory2.deleteSubDirectory(subDirName);
			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = true;

			// When op for deleting /subDir comes, it will not delete subdirectories who are created locally and
			// ack is pending as they will recreated again. Both directories will contain /subDir/subDir but
			// no /subDir/subDir2. It will also not delete pending keys in pending subDirs.
			containerRuntimeFactory.processAllMessages();

			assert(directory1.getSubDirectory(subDirName) !== undefined, "/subDir should exist");
			assert(
				directory1.getSubDirectory(subDirName)?.getSubDirectory(subDirName) !== undefined,
				"/subDir/subDir should exist",
			);
			assert(
				directory1
					.getSubDirectory(subDirName)
					?.getSubDirectory(subDirName)
					?.get(subDirKey) === subDirValue,
				"/subDir/subDir(subDirKey) should exist",
			);
			assertEquivalentDirectories(directory1, directory2);
		});

		it("multiple create/delete subDirs on disconnection/reconnection 1", async () => {
			const subDirName1 = "subDir";

			const subDir = directory1.createSubDirectory(subDirName1);
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = false;
			// These ops will not be sent initially as we are in disconnected state.
			subDir.createSubDirectory(subDirName1);
			subDir.deleteSubDirectory(subDirName1);
			subDir.createSubDirectory(subDirName1);
			subDir.deleteSubDirectory(subDirName1);
			subDir.createSubDirectory(subDirName1);

			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = true;

			// /subDir/subDir should exist in the end
			containerRuntimeFactory.processAllMessages();
			assert(directory1.getSubDirectory(subDirName1) !== undefined, "/subDir should exist");
			assert(
				directory1.getSubDirectory(subDirName1)?.getSubDirectory(subDirName1) !== undefined,
				"/subDir/subDir should exist",
			);
			assertEquivalentDirectories(directory1, directory2);
		});

		it("multiple create/delete subDirs on disconnection/reconnection 2", async () => {
			const subDirName1 = "subDir";

			containerRuntime1.connected = false;
			// These ops will not be sent initially as we are in disconnected state.
			const subDir = directory1.createSubDirectory(subDirName1);
			subDir.createSubDirectory(subDirName1);
			subDir.deleteSubDirectory(subDirName1);
			subDir.createSubDirectory(subDirName1);
			directory1.deleteSubDirectory(subDirName1);
			directory1.createSubDirectory(subDirName1);

			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = true;

			// /subDir/subDir should not exist in the end as /subDir was deleted after it was created
			containerRuntimeFactory.processAllMessages();
			assert(directory1.getSubDirectory(subDirName1) !== undefined, "/subDir should exist");
			assert(
				directory1.getSubDirectory(subDirName1)?.getSubDirectory(subDirName1) === undefined,
				"/subDir/subDir should not exist",
			);
			assertEquivalentDirectories(directory1, directory2);
		});

		it("multiple create/delete subDirs on disconnection/reconnection 3", async () => {
			const subDirName1 = "subDir";

			containerRuntime1.connected = false;
			// These ops will not be sent initially as we are in disconnected state.
			const subDir = directory1.createSubDirectory(subDirName1);
			subDir.createSubDirectory(subDirName1);
			directory1.deleteSubDirectory(subDirName1);
			directory1.createSubDirectory(subDirName1);

			containerRuntimeFactory.processAllMessages();
			containerRuntime1.connected = true;

			// /subDir/subDir should not exist in the end as /subDir was deleted after it was created
			containerRuntimeFactory.processAllMessages();
			assert(directory1.getSubDirectory(subDirName1) !== undefined, "/subDir should exist");
			assert(
				directory1.getSubDirectory(subDirName1)?.getSubDirectory(subDirName1) === undefined,
				"/subDir/subDir should not exist",
			);
			assertEquivalentDirectories(directory1, directory2);
		});
	});
});
