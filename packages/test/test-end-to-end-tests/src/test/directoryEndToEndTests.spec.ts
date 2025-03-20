/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import {
	ConfigTypes,
	IConfigProviderBase,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import type {
	IDirectory,
	IDirectoryValueChanged,
	ISharedDirectory,
	ISharedMap,
	SharedDirectory,
} from "@fluidframework/map/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	toIDeltaManagerFull,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

describeCompat("SharedDirectory", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedMap, SharedDirectory } = apis.dds;
	const directoryId = "directoryKey";
	const registry: ChannelFactoryRegistry = [[directoryId, SharedDirectory.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});
	let dataObject1: ITestFluidObject;
	let sharedDirectory1: ISharedDirectory;
	let sharedDirectory2: ISharedDirectory;
	let sharedDirectory3: ISharedDirectory;

	beforeEach("createContainers", async () => {
		// Create a Container for the first client.
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		sharedDirectory1 = await dataObject1.getSharedObject<SharedDirectory>(directoryId);

		// Load the Container that was created by the first client.
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		sharedDirectory2 = await dataObject2.getSharedObject<SharedDirectory>(directoryId);

		// Load the Container that was created by the first client.
		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataObject3 = await getContainerEntryPointBackCompat<ITestFluidObject>(container3);
		sharedDirectory3 = await dataObject3.getSharedObject<SharedDirectory>(directoryId);

		await provider.ensureSynchronized();
	});

	function expectAllValues(msg, key, path, value1, value2, value3) {
		const user1Value = sharedDirectory1.getWorkingDirectory(path)?.get(key);
		assert.equal(user1Value, value1, `Incorrect value for ${key} in container 1 ${msg}`);
		const user2Value = sharedDirectory2.getWorkingDirectory(path)?.get(key);
		assert.equal(user2Value, value2, `Incorrect value for ${key} in container 2 ${msg}`);
		const user3Value = sharedDirectory3.getWorkingDirectory(path)?.get(key);
		assert.equal(user3Value, value3, `Incorrect value for ${key} in container 3 ${msg}`);
	}

	function expectAllBeforeValues(key, path, value1, value2, value3) {
		expectAllValues("before process", key, path, value1, value2, value3);
	}

	function expectAllAfterValues(key, path, value) {
		expectAllValues("after process", key, path, value, value, value);
	}

	function expectAllSize(size: number, path?: string) {
		const dir1 = path ? sharedDirectory1.getWorkingDirectory(path) : sharedDirectory1;
		const dir2 = path ? sharedDirectory2.getWorkingDirectory(path) : sharedDirectory2;
		const dir3 = path ? sharedDirectory3.getWorkingDirectory(path) : sharedDirectory3;

		assert(dir1);
		assert(dir2);
		assert(dir3);

		const keys1 = Array.from(dir1.keys());
		assert.equal(keys1.length, size, "Incorrect number of Keys in container 1");
		const keys2 = Array.from(dir2.keys());
		assert.equal(keys2.length, size, "Incorrect number of Keys in container 2");
		const keys3 = Array.from(dir3.keys());
		assert.equal(keys3.length, size, "Incorrect number of Keys in container 3");

		assert.equal(dir1.size, size, "Incorrect map size in container 1");
		assert.equal(dir2.size, size, "Incorrect map size in container 2");
		assert.equal(dir3.size, size, "Incorrect map size in container 3");
	}

	describe("Smoke test", () => {
		it("should create the directory in 3 containers correctly", async () => {
			// Directory was created in beforeEach
			assert.ok(
				sharedDirectory1,
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`Couldn't find the directory in root1, instead got ${sharedDirectory1}`,
			);
			assert.ok(
				sharedDirectory2,
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`Couldn't find the directory in root2, instead got ${sharedDirectory2}`,
			);
			assert.ok(
				sharedDirectory3,
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`Couldn't find the directory in root3, instead got ${sharedDirectory3}`,
			);
		});

		it("should set a key in the directory in three containers correctly", async () => {
			sharedDirectory1.set("testKey1", "testValue1");
			await provider.ensureSynchronized();
			expectAllAfterValues("testKey1", "/", "testValue1");
		});
	});

	describe("Root operations", () => {
		beforeEach("Populate with a value under the root", async () => {
			sharedDirectory1.set("testKey1", "testValue1");
			await provider.ensureSynchronized();
			expectAllAfterValues("testKey1", "/", "testValue1");
		});

		it("should delete a value in 3 containers correctly", async () => {
			sharedDirectory2.delete("testKey1");
			await provider.ensureSynchronized();

			const hasKey1 = sharedDirectory1.has("testKey1");
			assert.equal(hasKey1, false, "testKey1 not deleted in container 1");

			const hasKey2 = sharedDirectory2.has("testKey1");
			assert.equal(hasKey2, false, "testKey1 not deleted in container 2");

			const hasKey3 = sharedDirectory3.has("testKey1");
			assert.equal(hasKey3, false, "testKey1 not deleted in container 3");
		});

		it("should have the correct size in three containers", async () => {
			sharedDirectory3.set("testKey3", true);

			await provider.ensureSynchronized();

			// check the number of keys in the map (2 keys set)
			expectAllSize(2);
		});

		it("should set key value to undefined in three containers correctly", async () => {
			sharedDirectory2.set("testKey1", undefined);
			sharedDirectory2.set("testKey2", undefined);

			await provider.ensureSynchronized();

			expectAllAfterValues("testKey1", "/", undefined);
			expectAllAfterValues("testKey2", "/", undefined);
		});

		it("should update value and trigger onValueChanged on other two containers", async () => {
			let user1ValueChangedCount: number = 0;
			let user2ValueChangedCount: number = 0;
			let user3ValueChangedCount: number = 0;
			sharedDirectory1.on("valueChanged", (changed, local) => {
				if (!local) {
					assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 1");
					user1ValueChangedCount = user1ValueChangedCount + 1;
				}
			});
			sharedDirectory2.on("valueChanged", (changed, local) => {
				if (!local) {
					assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 2");
					user2ValueChangedCount = user2ValueChangedCount + 1;
				}
			});
			sharedDirectory3.on("valueChanged", (changed, local) => {
				if (!local) {
					assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 3");
					user3ValueChangedCount = user3ValueChangedCount + 1;
				}
			});

			sharedDirectory1.set("testKey1", "updatedValue");

			await provider.ensureSynchronized();

			assert.equal(
				user1ValueChangedCount,
				0,
				"Incorrect number of valueChanged op received in container 1",
			);
			assert.equal(
				user2ValueChangedCount,
				1,
				"Incorrect number of valueChanged op received in container 2",
			);
			assert.equal(
				user3ValueChangedCount,
				1,
				"Incorrect number of valueChanged op received in container 3",
			);

			expectAllAfterValues("testKey1", "/", "updatedValue");
		});

		describe("Eventual consistency after simultaneous operations", () => {
			it("set/set", async () => {
				sharedDirectory1.set("testKey1", "value1");
				sharedDirectory2.set("testKey1", "value2");
				sharedDirectory3.set("testKey1", "value0");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				sharedDirectory3.set("testKey1", "value3");

				expectAllBeforeValues("testKey1", "/", "value1", "value2", "value3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey1", "/", "value3");
			});

			it("delete/set", async () => {
				// set after delete
				sharedDirectory1.set("testKey1", "value1.1");
				sharedDirectory2.delete("testKey1");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				sharedDirectory3.set("testKey1", "value1.3");

				expectAllBeforeValues("testKey1", "/", "value1.1", undefined, "value1.3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey1", "/", "value1.3");
			});

			it("delete/set from the same container", async () => {
				// delete and then set on the same container
				sharedDirectory1.set("testKey2", "value2.1");
				sharedDirectory2.delete("testKey2");
				sharedDirectory3.set("testKey2", "value2.3");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				sharedDirectory2.set("testKey2", "value2.2");

				expectAllBeforeValues("testKey2", "/", "value2.1", "value2.2", "value2.3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey2", "/", "value2.2");
			});

			it("set/delete", async function () {
				// delete after set
				sharedDirectory1.set("testKey3", "value3.1");
				sharedDirectory2.set("testKey3", "value3.2");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				sharedDirectory3.delete("testKey3");

				expectAllBeforeValues("testKey3", "/", "value3.1", "value3.2", undefined);

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey3", "/", undefined);
			});

			it("set/clear", async () => {
				// clear after set
				sharedDirectory1.set("testKey1", "value1.1");
				sharedDirectory2.set("testKey1", "value1.2");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				sharedDirectory3.clear();

				expectAllBeforeValues("testKey1", "/", "value1.1", "value1.2", undefined);

				assert.equal(sharedDirectory3.size, 0, "Incorrect map size after clear");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey1", "/", undefined);
				expectAllSize(0);
			});

			it("clear/set on the same container", async () => {
				// set after clear on the same map
				sharedDirectory1.set("testKey2", "value2.1");
				sharedDirectory2.clear();
				sharedDirectory3.set("testKey2", "value2.3");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				sharedDirectory2.set("testKey2", "value2.2");
				expectAllBeforeValues("testKey2", "/", "value2.1", "value2.2", "value2.3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey2", "/", "value2.2");
				expectAllSize(1);
			});

			it("clear/set", async () => {
				// set after clear
				sharedDirectory1.set("testKey3", "value3.1");
				sharedDirectory2.clear();

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				sharedDirectory3.set("testKey3", "value3.3");
				expectAllBeforeValues("testKey3", "/", "value3.1", undefined, "value3.3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey3", "/", "value3.3");
				expectAllSize(1);
			});
		});

		describe("Nested map support", () => {
			it("supports setting a map as a value", async () => {
				const newMap = SharedMap.create(dataObject1.runtime);
				sharedDirectory1.set("mapKey", newMap.handle);

				await provider.ensureSynchronized();

				const [map1, map2, map3] = await Promise.all([
					sharedDirectory1.get<IFluidHandle<ISharedMap>>("mapKey")?.get(),
					sharedDirectory2.get<IFluidHandle<ISharedMap>>("mapKey")?.get(),
					sharedDirectory3.get<IFluidHandle<ISharedMap>>("mapKey")?.get(),
				]);

				assert.ok(map1, "Map did not correctly set as value in container 1");
				assert.ok(map2, "Map did not correctly set as value in container 2");
				assert.ok(map3, "Map did not correctly set as value in container 3");

				map2.set("testMapKey", "testMapValue");

				await provider.ensureSynchronized();

				assert.equal(
					map3.get("testMapKey"),
					"testMapValue",
					"Wrong values in map in container 3",
				);
			});
		});
	});

	describe("SubDirectory operations", () => {
		it("should set a key in a SubDirectory in three containers correctly", async () => {
			sharedDirectory1.createSubDirectory("testSubDir1").set("testKey1", "testValue1");

			await provider.ensureSynchronized();

			expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
		});

		it("should delete a key in a SubDirectory in three containers correctly", async () => {
			sharedDirectory2.createSubDirectory("testSubDir1").set("testKey1", "testValue1");

			await provider.ensureSynchronized();

			expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
			const subDir1 = sharedDirectory3.getWorkingDirectory("testSubDir1");
			assert(subDir1);
			subDir1.delete("testKey1");

			await provider.ensureSynchronized();

			expectAllAfterValues("testKey1", "testSubDir1", undefined);
		});

		it("should delete a child SubDirectory in a SubDirectory in three containers correctly", async () => {
			sharedDirectory2.createSubDirectory("testSubDir1").set("testKey1", "testValue1");

			await provider.ensureSynchronized();

			expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
			sharedDirectory3.deleteSubDirectory("testSubDir1");

			await provider.ensureSynchronized();

			assert.equal(
				sharedDirectory1.getWorkingDirectory("testSubDir1"),
				undefined,
				"SubDirectory not deleted in container 1",
			);
			assert.equal(
				sharedDirectory2.getWorkingDirectory("testSubDir1"),
				undefined,
				"SubDirectory not deleted in container 2",
			);
			assert.equal(
				sharedDirectory3.getWorkingDirectory("testSubDir1"),
				undefined,
				"SubDirectory not deleted in container 3",
			);
		});

		it("should have the correct size in three containers", async () => {
			sharedDirectory1.createSubDirectory("testSubDir1").set("testKey1", "testValue1");
			sharedDirectory2.createSubDirectory("testSubDir1").set("testKey2", "testValue2");
			sharedDirectory3.createSubDirectory("otherSubDir2").set("testKey3", "testValue3");

			await provider.ensureSynchronized();

			expectAllSize(2, "testSubDir1");
			sharedDirectory3.getWorkingDirectory("testSubDir1")?.clear();

			await provider.ensureSynchronized();

			expectAllSize(0, "testSubDir1");
		});

		it("should update value and trigger onValueChanged on other two containers", async () => {
			let user1ValueChangedCount: number = 0;
			let user2ValueChangedCount: number = 0;
			let user3ValueChangedCount: number = 0;
			sharedDirectory1.on("valueChanged", (changed, local) => {
				if (!local) {
					assert.equal(changed.key, "testKey1", "Incorrect value for key in container 1");
					assert.equal(
						changed.path,
						"/testSubDir1",
						"Incorrect value for path in container 1",
					);
					user1ValueChangedCount = user1ValueChangedCount + 1;
				}
			});
			sharedDirectory2.on("valueChanged", (changed, local) => {
				if (!local) {
					assert.equal(changed.key, "testKey1", "Incorrect value for key in container 2");
					assert.equal(
						changed.path,
						"/testSubDir1",
						"Incorrect value for path in container 2",
					);
					user2ValueChangedCount = user2ValueChangedCount + 1;
				}
			});
			sharedDirectory3.on("valueChanged", (changed, local) => {
				if (!local) {
					assert.equal(changed.key, "testKey1", "Incorrect value for key in container 3");
					assert.equal(
						changed.path,
						"/testSubDir1",
						"Incorrect value for path in container 3",
					);
					user3ValueChangedCount = user3ValueChangedCount + 1;
				}
			});

			sharedDirectory1.createSubDirectory("testSubDir1").set("testKey1", "updatedValue");

			await provider.ensureSynchronized();

			assert.equal(
				user1ValueChangedCount,
				0,
				"Incorrect number of valueChanged op received in container 1",
			);
			assert.equal(
				user2ValueChangedCount,
				1,
				"Incorrect number of valueChanged op received in container 2",
			);
			assert.equal(
				user3ValueChangedCount,
				1,
				"Incorrect number of valueChanged op received in container 3",
			);

			expectAllAfterValues("testKey1", "/testSubDir1", "updatedValue");
		});

		describe("Eventual consistency after simultaneous operations", () => {
			let root1SubDir;
			let root2SubDir;
			let root3SubDir;
			beforeEach("createSubdirectories", async () => {
				sharedDirectory1.createSubDirectory("testSubDir").set("dummyKey", "dummyValue");

				await provider.ensureSynchronized();

				root1SubDir = sharedDirectory1.getWorkingDirectory("testSubDir");
				root2SubDir = sharedDirectory2.getWorkingDirectory("testSubDir");
				root3SubDir = sharedDirectory3.getWorkingDirectory("testSubDir");
			});

			it("set/set", async () => {
				root1SubDir.set("testKey1", "value1");
				root2SubDir.set("testKey1", "value2");
				root3SubDir.set("testKey1", "value0");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				root3SubDir.set("testKey1", "value3");

				expectAllBeforeValues("testKey1", "/testSubDir", "value1", "value2", "value3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey1", "/testSubDir", "value3");
			});

			it("delete/set", async () => {
				// set after delete
				root1SubDir.set("testKey1", "value1.1");
				root2SubDir.delete("testKey1");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				root3SubDir.set("testKey1", "value1.3");

				expectAllBeforeValues("testKey1", "/testSubDir", "value1.1", undefined, "value1.3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey1", "/testSubDir", "value1.3");
			});

			it("delete/set from the same container", async () => {
				// delete and then set on the same container
				root1SubDir.set("testKey2", "value2.1");
				root2SubDir.delete("testKey2");
				root3SubDir.set("testKey2", "value2.3");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				root2SubDir.set("testKey2", "value2.2");
				expectAllBeforeValues("testKey2", "/testSubDir", "value2.1", "value2.2", "value2.3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey2", "/testSubDir", "value2.2");
			});

			it("set/delete", async function () {
				// delete after set
				root1SubDir.set("testKey3", "value3.1");
				root2SubDir.set("testKey3", "value3.2");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				root3SubDir.delete("testKey3");

				expectAllBeforeValues("testKey3", "/testSubDir", "value3.1", "value3.2", undefined);

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey3", "/testSubDir", undefined);
			});

			it("set/clear", async () => {
				// clear after set
				root1SubDir.set("testKey1", "value1.1");
				root2SubDir.set("testKey1", "value1.2");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				root3SubDir.clear();
				expectAllBeforeValues("testKey1", "/testSubDir", "value1.1", "value1.2", undefined);
				assert.equal(root3SubDir.size, 0, "Incorrect map size after clear");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey1", "/testSubDir", undefined);
				expectAllSize(0, "/testSubDir");
			});

			it("clear/set on the same container", async () => {
				// set after clear on the same map
				root1SubDir.set("testKey2", "value2.1");
				root2SubDir.clear();
				root3SubDir.set("testKey2", "value2.3");

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				root2SubDir.set("testKey2", "value2.2");
				expectAllBeforeValues("testKey2", "/testSubDir", "value2.1", "value2.2", "value2.3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey2", "/testSubDir", "value2.2");
				expectAllSize(1, "/testSubDir");
			});

			it("clear/set", async () => {
				// set after clear
				root1SubDir.set("testKey3", "value3.1");
				root2SubDir.clear();

				// drain the outgoing so that the next set will come after
				await provider.opProcessingController.processOutgoing();

				root3SubDir.set("testKey3", "value3.3");
				expectAllBeforeValues("testKey3", "/testSubDir", "value3.1", undefined, "value3.3");

				await provider.ensureSynchronized();

				expectAllAfterValues("testKey3", "/testSubDir", "value3.3");
				expectAllSize(1, "/testSubDir");
			});
		});

		it("Only creates a subdirectory once when simultaneously created", async function () {
			const root1SubDir = sharedDirectory1.createSubDirectory("testSubDir");
			root1SubDir.set("testKey", "testValue");
			const root2SubDir = sharedDirectory2.createSubDirectory("testSubDir");
			root2SubDir.set("testKey2", "testValue2");

			await provider.ensureSynchronized();

			assert.strictEqual(
				sharedDirectory1.getSubDirectory("testSubDir"),
				root1SubDir,
				"Created two separate subdirectories in root1",
			);
			assert.strictEqual(
				sharedDirectory2.getSubDirectory("testSubDir"),
				root2SubDir,
				"Created two separate subdirectories in root2",
			);
			assert.strictEqual(root1SubDir.get("testKey2"), "testValue2", "Value 2 not present");
			assert.strictEqual(root2SubDir.get("testKey"), "testValue", "Value 1 not present");
		});
	});

	describe("Operations in local state", () => {
		describe("Load new directory with data from local state and process ops", () => {
			/**
			 * These tests test the scenario found in the following bug:
			 * https://github.com/microsoft/FluidFramework/issues/2400
			 *
			 * - A SharedDirectory in local state performs a set or directory operation.
			 *
			 * - A second SharedDirectory is then created from the summary of the first one.
			 *
			 * - The second SharedDirectory performs the same operation as the first one but with a different value.
			 *
			 * - The expected behavior is that the first SharedDirectory updates the key with the new value. But in the
			 * bug, the first SharedDirectory stores the key in its pending state even though it does not send out an
			 * an op. So when it gets a remote op with the same key, it ignores it as it has a pending op with the
			 * same key.
			 */

			it("can process set in local state", async () => {
				// Create a new directory in local (detached) state.
				const newDirectory1 = SharedDirectory.create(dataObject1.runtime);

				// Set a value while in local state.
				newDirectory1.set("newKey", "newValue");

				// Now add the handle to an attached directory so the new directory gets attached too.
				sharedDirectory1.set("newSharedDirectory", newDirectory1.handle);

				await provider.ensureSynchronized();

				// The new directory should be available in the remote client and it should contain that key that was
				// set in local state.
				const newDirectory2Handle =
					sharedDirectory2.get<IFluidHandle<SharedDirectory>>("newSharedDirectory");
				assert(newDirectory2Handle);
				const newDirectory2 = await newDirectory2Handle.get();
				assert.equal(
					newDirectory2.get("newKey"),
					"newValue",
					"The data set in local state is not available in directory 2",
				);

				// Set a new value for the same key in the remote directory.
				newDirectory2.set("newKey", "anotherNewValue");

				await provider.ensureSynchronized();

				// Verify that the new value is updated in both the directories.
				assert.equal(
					newDirectory2.get("newKey"),
					"anotherNewValue",
					"The new value is not updated in directory 2",
				);
				assert.equal(
					newDirectory1.get("newKey"),
					"anotherNewValue",
					"The new value is not updated in directory 1",
				);
			});

			it("can process sub directory ops in local state", async () => {
				// Create a new directory in local (detached) state.
				const newDirectory1 = SharedDirectory.create(dataObject1.runtime);

				// Create a sub directory while in local state.
				const subDirName = "testSubDir";
				newDirectory1.createSubDirectory(subDirName);

				// Now add the handle to an attached directory so the new directory gets attached too.
				sharedDirectory1.set("newSharedDirectory", newDirectory1.handle);

				await provider.ensureSynchronized();

				// The new directory should be available in the remote client and it should contain that key that was
				// set in local state.
				const newDirectory2Handle =
					sharedDirectory2.get<IFluidHandle<SharedDirectory>>("newSharedDirectory");
				assert(newDirectory2Handle);
				const newDirectory2 = await newDirectory2Handle.get();
				assert.ok(
					newDirectory2.getSubDirectory(subDirName),
					"The subdirectory created in local state is not available in directory 2",
				);

				// Delete the sub directory from the remote client.
				newDirectory2.deleteSubDirectory(subDirName);

				await provider.ensureSynchronized();

				// Verify that the sub directory is deleted from both the directories.
				assert.equal(
					newDirectory2.getSubDirectory(subDirName),
					undefined,
					"The sub directory is not deleted from directory 2",
				);
				assert.equal(
					newDirectory1.getSubDirectory(subDirName),
					undefined,
					"The sub directory is not deleted from directory 1",
				);
			});
		});
	});

	describe("Attachment behavior", () => {
		it("attaches if referring SharedDirectory becomes attached or is already attached", async () => {
			const detachedDirectory1: ISharedDirectory = SharedDirectory.create(dataObject1.runtime);
			const detachedDirectory2: ISharedDirectory = SharedDirectory.create(dataObject1.runtime);

			// When an unattached directory refers to another unattached directory, both remain unattached
			detachedDirectory1.set("newSharedDirectory", detachedDirectory2.handle);
			assert.equal(sharedDirectory1.isAttached(), true, "sharedDirectory1 should be attached");
			assert.equal(
				detachedDirectory1.isAttached(),
				false,
				"detachedDirectory1 should not be attached",
			);
			assert.equal(
				detachedDirectory2.isAttached(),
				false,
				"detachedDirectory2 should not be attached",
			);

			// When referring directory becomes attached, the referred directory becomes attached
			// and the attachment transitively passes to a second referred directory
			sharedDirectory1.set("newSharedDirectory", detachedDirectory1.handle);
			assert.equal(sharedDirectory1.isAttached(), true, "sharedDirectory1 should be attached");
			assert.equal(
				detachedDirectory1.isAttached(),
				true,
				"detachedDirectory1 should be attached",
			);
			assert.equal(
				detachedDirectory2.isAttached(),
				true,
				"detachedDirectory2 should be attached",
			);
		});
	});
});

describeCompat(
	"SharedDirectory orderSequentially",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedDirectory } = apis.dds;
		const directoryId = "directoryKey";
		const registry: ChannelFactoryRegistry = [[directoryId, SharedDirectory.getFactory()]];
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
		};

		let provider: ITestObjectProvider;
		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
		});

		let container: IContainer;
		let dataObject: ITestFluidObject;
		let sharedDir: ISharedDirectory;
		let containerRuntime: IContainerRuntime;
		let clearEventCount: number;
		let changedEventData: IDirectoryValueChanged[];
		let subDirCreatedEventData: string[];
		let subDirDeletedEventData: string[];
		let undisposedEventData: string[];
		let disposedEventData: string[];

		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});
		const errorMessage = "callback failure";

		beforeEach("setup", async () => {
			const configWithFeatureGates = {
				...testContainerConfig,
				loaderProps: {
					configProvider: configProvider({
						"Fluid.ContainerRuntime.EnableRollback": true,
					}),
				},
			};
			container = await provider.makeTestContainer(configWithFeatureGates);
			dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			sharedDir = await dataObject.getSharedObject<SharedDirectory>(directoryId);
			containerRuntime = dataObject.context.containerRuntime as IContainerRuntime;
			clearEventCount = 0;
			changedEventData = [];
			subDirCreatedEventData = [];
			subDirDeletedEventData = [];
			undisposedEventData = [];
			disposedEventData = [];
			sharedDir.on("valueChanged", (changed, _local, _target) => {
				changedEventData.push(changed);
			});
			sharedDir.on("clear", (local, target) => {
				clearEventCount++;
			});
			sharedDir.on("subDirectoryCreated", (path, _local, _target) => {
				subDirCreatedEventData.push(path);
			});
			sharedDir.on("subDirectoryDeleted", (path, _local, _target) => {
				subDirDeletedEventData.push(path);
			});
		});

		it("Should rollback set", () => {
			let error: Error | undefined;
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.set("key", 0);
					throw new Error(errorMessage);
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false, "Container disposed");
			assert.equal(sharedDir.size, 0);
			assert.equal(sharedDir.has("key"), false);
			assert.equal(clearEventCount, 0);
			assert.equal(changedEventData.length, 2);
			assert.equal(changedEventData[0].key, "key");
			assert.equal(changedEventData[0].previousValue, undefined);
			// rollback
			assert.equal(changedEventData[1].key, "key");
			assert.equal(changedEventData[1].previousValue, 0);
		});

		it("Should rollback set to prior value", () => {
			sharedDir.set("key", "old");
			let error: Error | undefined;
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.set("key", "new");
					sharedDir.set("key", "last");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.size, 1);
			assert.equal(sharedDir.get("key"), "old", `Unexpected value ${sharedDir.get("key")}`);
			assert.equal(clearEventCount, 0);
			assert.equal(changedEventData.length, 5);
			assert.equal(changedEventData[0].key, "key");
			assert.equal(changedEventData[0].previousValue, undefined);
			assert.equal(changedEventData[1].key, "key");
			assert.equal(changedEventData[1].previousValue, "old");
			assert.equal(changedEventData[2].key, "key");
			assert.equal(changedEventData[2].previousValue, "new");
			// rollback
			assert.equal(changedEventData[3].key, "key");
			assert.equal(changedEventData[3].previousValue, "last");
			assert.equal(changedEventData[4].key, "key");
			assert.equal(changedEventData[4].previousValue, "new");
		});

		it("Should rollback delete", () => {
			sharedDir.set("key", "old");
			let error: Error | undefined;
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.delete("key");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.size, 1);
			assert.equal(sharedDir.get("key"), "old", `Unexpected value ${sharedDir.get("key")}`);
			assert.equal(clearEventCount, 0);
			assert.equal(changedEventData.length, 3);
			assert.equal(changedEventData[0].key, "key");
			assert.equal(changedEventData[0].previousValue, undefined);
			assert.equal(changedEventData[1].key, "key");
			assert.equal(changedEventData[1].previousValue, "old");
			// rollback
			assert.equal(changedEventData[2].key, "key");
			assert.equal(changedEventData[2].previousValue, undefined);
		});

		it("Should rollback clear", () => {
			sharedDir.set("key1", "old1");
			sharedDir.set("key2", "old2");
			let error: Error | undefined;
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.clear();
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.size, 2);
			assert.equal(sharedDir.get("key1"), "old1", `Unexpected value ${sharedDir.get("key1")}`);
			assert.equal(sharedDir.get("key2"), "old2", `Unexpected value ${sharedDir.get("key2")}`);
			assert.equal(changedEventData.length, 4);
			assert.equal(changedEventData[0].key, "key1");
			assert.equal(changedEventData[0].previousValue, undefined);
			assert.equal(changedEventData[1].key, "key2");
			assert.equal(changedEventData[1].previousValue, undefined);
			assert.equal(clearEventCount, 1);
			// rollback
			assert.equal(changedEventData[2].key, "key1");
			assert.equal(changedEventData[2].previousValue, undefined);
			assert.equal(changedEventData[3].key, "key2");
			assert.equal(changedEventData[3].previousValue, undefined);
		});

		it("Should rollback newly created subdirectory", () => {
			let error: Error | undefined;
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.createSubDirectory("subDirName");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.countSubDirectory?.(), 0);
			assert.equal(subDirCreatedEventData.length, 1);
			assert.equal(subDirCreatedEventData[0], "subDirName");
			// rollback
			assert.equal(subDirDeletedEventData.length, 1);
			assert.equal(subDirDeletedEventData[0], "subDirName");
		});

		it("Should not rollback creating existing subdirectory", () => {
			let error: Error | undefined;
			const subDir = sharedDir.createSubDirectory("subDirName");
			subDir.on("undisposed", (value: IDirectory) => {
				undisposedEventData.push(value.absolutePath);
			});
			subDir.on("disposed", (value: IDirectory) => {
				disposedEventData.push(value.absolutePath);
			});
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.createSubDirectory("subDirName");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.countSubDirectory?.(), 1);
			assert.notEqual(sharedDir.getSubDirectory("subDirName"), undefined);
			assert.equal(subDirCreatedEventData.length, 1);
			assert.equal(subDirCreatedEventData[0], "subDirName");
			// rollback
			assert.equal(subDirDeletedEventData.length, 0);
			// ensure that dispose/undispose aren't fired
			assert.equal(undisposedEventData.length, 0);
			assert.equal(disposedEventData.length, 0);
		});

		it("Should rollback created subdirectory with content", () => {
			let error: Error | undefined;
			try {
				containerRuntime.orderSequentially(() => {
					const subdir = sharedDir.createSubDirectory("subDirName");
					subdir.set("key1", "content1");
					subdir.createSubDirectory("subSubDirName");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.countSubDirectory?.(), 0);
			assert.equal(
				subDirCreatedEventData.length,
				2,
				`subDirCreatedEventData.length: ${subDirCreatedEventData.length}`,
			);
			assert.equal(subDirCreatedEventData[0], "subDirName");
			assert.equal(subDirCreatedEventData[1], "subDirName/subSubDirName");
			assert.equal(changedEventData.length, 2);
			assert.equal(changedEventData[0].key, "key1");
			assert.equal(changedEventData[0].previousValue, undefined);
			// rollback
			assert.equal(changedEventData[1].key, "key1");
			assert.equal(changedEventData[1].previousValue, "content1");
			assert.equal(
				subDirDeletedEventData.length,
				2,
				`subDirDeletedEventData.length: ${subDirDeletedEventData.length}`,
			);
			assert.equal(subDirDeletedEventData[0], "subDirName/subSubDirName");
			assert.equal(subDirDeletedEventData[1], "subDirName");
		});

		it("Should rollback deleted subdirectory", () => {
			let error: Error | undefined;
			const subDir = sharedDir.createSubDirectory("subDirName");
			subDir.on("undisposed", (value: IDirectory) => {
				undisposedEventData.push(value.absolutePath);
			});
			subDir.on("disposed", (value: IDirectory) => {
				disposedEventData.push(value.absolutePath);
			});
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.deleteSubDirectory("subDirName");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.countSubDirectory?.(), 1);
			assert.notEqual(sharedDir.getSubDirectory("subDirName"), undefined);
			assert.equal(subDirCreatedEventData.length, 2);
			assert.equal(subDirCreatedEventData[0], "subDirName");
			assert.equal(subDirDeletedEventData.length, 1);
			assert.equal(subDirDeletedEventData[0], "subDirName");
			// rollback
			assert.equal(subDirCreatedEventData[1], "subDirName");
			assert.equal(undisposedEventData.length, 1);
			assert.equal(undisposedEventData[0], "/subDirName");
			assert.equal(disposedEventData.length, 1);
		});

		it("Should not rollback deleting nonexistent subdirectory", () => {
			let error: Error | undefined;
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.deleteSubDirectory("subDirName");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.countSubDirectory?.(), 0);
			assert.equal(subDirDeletedEventData.length, 0);
			// rollback
			assert.equal(subDirCreatedEventData.length, 0);
		});

		it("Should rollback deleted subdirectory with content", () => {
			let error: Error | undefined;
			const subdir = sharedDir.createSubDirectory("subDirName");
			subdir.on("undisposed", (value: IDirectory) => {
				undisposedEventData.push(value.absolutePath);
			});
			subdir.on("disposed", (value: IDirectory) => {
				disposedEventData.push(value.absolutePath);
			});
			subdir.set("key1", "content1");
			const subsubdir = subdir.createSubDirectory("subSubDirName");
			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.deleteSubDirectory("subDirName");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			assert.equal(sharedDir.countSubDirectory?.(), 1);
			const readSubdir = sharedDir.getSubDirectory("subDirName");
			assert.equal(readSubdir, subdir);
			assert.equal(subdir.size, 1);
			assert.equal(subdir.get("key1"), "content1");
			assert.equal(subdir.countSubDirectory ? subdir.countSubDirectory() : 0, 1);
			assert.notEqual(subdir.getSubDirectory("subSubDirName"), undefined);
			assert.equal(subDirCreatedEventData.length, 3);
			assert.equal(subDirCreatedEventData[0], "subDirName");
			assert.equal(subDirCreatedEventData[1], "subDirName/subSubDirName");
			assert.equal(
				changedEventData.length,
				1,
				`changedEventData.length:${changedEventData.length}`,
			);
			assert.equal(changedEventData[0].key, "key1");
			assert.equal(changedEventData[0].previousValue, undefined);
			assert.equal(subDirDeletedEventData.length, 1);
			assert.equal(subDirDeletedEventData[0], "subDirName");
			// rollback
			assert.equal(subDirCreatedEventData[2], "subDirName");
			assert.equal(undisposedEventData.length, 1);
			assert.equal(undisposedEventData[0], "/subDirName");
			assert.equal(disposedEventData.length, 1);

			// verify we still get events on restored content
			readSubdir.set("key2", "content2");

			assert.equal(changedEventData.length, 2);
			assert.equal(changedEventData[1].key, "key2");
			assert.equal(changedEventData[1].previousValue, undefined);
		});

		it("Should rollback deleted subdirectories with the original order", () => {
			let error: Error | undefined;

			sharedDir.createSubDirectory("dir2");
			sharedDir.createSubDirectory("dir3");
			sharedDir.createSubDirectory("dir1");

			let dirNames = Array.from(sharedDir.subdirectories()).map(([dirName, _]) => dirName);
			assert.deepStrictEqual(dirNames, ["dir2", "dir3", "dir1"]);

			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.deleteSubDirectory("dir3");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			// rollback
			dirNames = Array.from(sharedDir.subdirectories()).map(([dirName, _]) => dirName);
			assert.deepStrictEqual(dirNames, ["dir2", "dir3", "dir1"]);
		});

		it("Should rollback deleted subdirectory when multiple subdirectories exist", () => {
			let error: Error | undefined;

			sharedDir.createSubDirectory("dir2");
			sharedDir.createSubDirectory("dir3");
			sharedDir.createSubDirectory("dir1");

			try {
				containerRuntime.orderSequentially(() => {
					sharedDir.deleteSubDirectory("dir3");
					throw new Error("callback failure");
				});
			} catch (err) {
				error = err as Error;
			}

			assert.notEqual(error, undefined, "No error");
			assert.equal(error?.message, errorMessage, "Unexpected error message");
			assert.equal(containerRuntime.disposed, false);
			// rollback
			assert.equal(sharedDir.countSubDirectory?.(), 3);
			assert.equal(subDirCreatedEventData.length, 4);
			assert.deepStrictEqual(subDirCreatedEventData, ["dir2", "dir3", "dir1", "dir3"]);
			assert.equal(subDirDeletedEventData.length, 1);
			assert.equal(subDirDeletedEventData[0], "dir3");
		});
	},
);

describeCompat(
	"SharedDirectory ordering maintenance",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedDirectory } = apis.dds;
		const directoryId = "directoryKey";
		const registry: ChannelFactoryRegistry = [[directoryId, SharedDirectory.getFactory()]];
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
		};

		let provider: ITestObjectProvider;
		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
		});
		let container1: IContainer;
		let container2: IContainer;
		let container3: IContainer;

		let sharedDirectory1: ISharedDirectory;
		let sharedDirectory2: ISharedDirectory;
		let sharedDirectory3: ISharedDirectory;

		beforeEach("createSharedDirectories", async () => {
			// Create a Container for the first client.
			container1 = await provider.makeTestContainer(testContainerConfig);
			const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
			sharedDirectory1 = await dataObject1.getSharedObject<SharedDirectory>(directoryId);

			// Load the Container that was created by the first client.
			container2 = await provider.loadTestContainer(testContainerConfig);
			const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
			sharedDirectory2 = await dataObject2.getSharedObject<SharedDirectory>(directoryId);

			// Load the Container that was created by the first client.
			container3 = await provider.loadTestContainer(testContainerConfig);
			const dataObject3 = (await container3.getEntryPoint()) as ITestFluidObject;
			sharedDirectory3 = await dataObject3.getSharedObject<SharedDirectory>(directoryId);

			await provider.ensureSynchronized();
		});

		function expectSubdirsOrder(
			directory: ISharedDirectory,
			subdirsInOrder: string[],
			path?: string,
		) {
			const dir = path ? directory.getWorkingDirectory(path) : directory;
			assert(dir);

			const subdirs = Array.from(dir.subdirectories()).map(([subdirName, _]) => {
				return subdirName;
			});
			assert.deepEqual(subdirs, subdirsInOrder, "Incorrect order of subdirs in the container");
		}

		function expectAllSubdirsOrder(dirsInOrder: string[], path?: string) {
			expectSubdirsOrder(sharedDirectory1, dirsInOrder, path);
			expectSubdirsOrder(sharedDirectory2, dirsInOrder, path);
			expectSubdirsOrder(sharedDirectory3, dirsInOrder, path);
		}

		async function pauseAllContainers() {
			await toIDeltaManagerFull(container1.deltaManager).inbound.pause();
			await toIDeltaManagerFull(container2.deltaManager).inbound.pause();
			await toIDeltaManagerFull(container3.deltaManager).inbound.pause();

			await toIDeltaManagerFull(container1.deltaManager).outbound.pause();
			await toIDeltaManagerFull(container2.deltaManager).outbound.pause();
			await toIDeltaManagerFull(container3.deltaManager).outbound.pause();
		}

		function resumeContainer(c: IContainer) {
			toIDeltaManagerFull(c.deltaManager).inbound.resume();
			toIDeltaManagerFull(c.deltaManager).outbound.resume();
		}

		/**
		 * Wait for the message sent by the current container to be sequenced.
		 */
		async function waitForContainerSave(c: IContainer) {
			if (!c.isDirty) {
				return;
			}
			await new Promise<void>((resolve) => c.once("saved", () => resolve()));
		}

		it("Eventual consistency in ordering with subdirectories creation/deletion", async () => {
			// Pause to not allow ops to be processed while we maintained them in order.
			await pauseAllContainers();

			resumeContainer(container1);
			sharedDirectory1.createSubDirectory("dir2");
			await waitForContainerSave(container1);

			resumeContainer(container2);
			sharedDirectory2.createSubDirectory("dir1");
			sharedDirectory2.createSubDirectory("dir2");
			await waitForContainerSave(container2);

			resumeContainer(container3);
			sharedDirectory3.createSubDirectory("dir3");
			sharedDirectory3.createSubDirectory("dir2");
			await waitForContainerSave(container3);

			await provider.opProcessingController.processIncoming();
			await provider.ensureSynchronized();

			expectAllSubdirsOrder(["dir2", "dir1", "dir3"]);
		});
	},
);
