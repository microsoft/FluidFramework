/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import { DirectoryFactory } from "../../directoryFactory.js";
import type { ISharedDirectory, IValueChanged } from "../../interfaces.js";

interface RollbackTestSetup {
	sharedDirectory: ISharedDirectory;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
	containerRuntime: MockContainerRuntime;
}

interface SubDirectoryEvent {
	path: string;
	local: boolean;
}

const directoryFactory = new DirectoryFactory();

function setupRollbackTest(): RollbackTestSetup {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 }); // TurnBased
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedDirectory = directoryFactory.create(dataStoreRuntime, "shared-directory-1");
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedDirectory.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return {
		sharedDirectory,
		dataStoreRuntime,
		containerRuntimeFactory,
		containerRuntime,
	};
}

// Helper to create another client attached to the same containerRuntimeFactory
function createAdditionalClient(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string = "client-2",
): {
	sharedDirectory: ISharedDirectory;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntime;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedDirectory = directoryFactory.create(dataStoreRuntime, `shared-directory-${id}`);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedDirectory.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return { sharedDirectory, dataStoreRuntime, containerRuntime };
}

describe("SharedDirectory rollback", () => {
	describe("Storage operations (root subdirectory)", () => {
		it("should rollback set operation", () => {
			const { sharedDirectory, containerRuntime } = setupRollbackTest();
			const valueChanges: IValueChanged[] = [];
			sharedDirectory.on("valueChanged", (event: IValueChanged) => {
				valueChanges.push(event);
			});
			sharedDirectory.set("key1", "value1");
			assert.strictEqual(
				sharedDirectory.get("key1"),
				"value1",
				"Failed getting pending value",
			);
			assert.strictEqual(valueChanges.length, 1, "Should have one value change event");
			containerRuntime.rollback?.();
			assert.strictEqual(
				sharedDirectory.get("key1"),
				undefined,
				"Value should be rolled back",
			);
			assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
			assert.strictEqual(valueChanges[1].key, "key1", "Second event should be for key1");
			assert.strictEqual(
				valueChanges[1].previousValue,
				"value1",
				"Second event previousValue should be pre-rollback value",
			);
		});

		it("should rollback delete operation", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			sharedDirectory.set("key1", "value1");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			const valueChanges: IValueChanged[] = [];
			sharedDirectory.on("valueChanged", (event: IValueChanged) => {
				valueChanges.push(event);
			});
			sharedDirectory.delete("key1");
			assert.strictEqual(
				sharedDirectory.get("key1"),
				undefined,
				"Pending value should reflect the delete",
			);
			assert.strictEqual(valueChanges.length, 1, "Should have one value change event");
			containerRuntime.rollback?.();
			assert.strictEqual(
				sharedDirectory.get("key1"),
				"value1",
				"Value should be restored by rollback",
			);
			assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
			assert.strictEqual(valueChanges[1].key, "key1", "Second event should be for key1");
			assert.strictEqual(
				valueChanges[1].previousValue,
				undefined,
				"Second event previousValue should be pre-rollback value",
			);
		});

		it("should rollback clear operation", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			const valueChanges: IValueChanged[] = [];
			let clears: number = 0;
			sharedDirectory.on("valueChanged", (event: IValueChanged) => {
				valueChanges.push(event);
			});
			sharedDirectory.on("clear", () => {
				clears++;
			});

			sharedDirectory.clear();

			assert.strictEqual(
				sharedDirectory.get("key1"),
				undefined,
				"Pending value for key1 should reflect the clear",
			);
			assert.strictEqual(
				sharedDirectory.get("key2"),
				undefined,
				"Pending value for key2 should reflect the clear",
			);
			assert.strictEqual(valueChanges.length, 0, "Should have no value change events");
			assert.strictEqual(clears, 1, "Should have one clear event");
			containerRuntime.rollback?.();
			assert.strictEqual(
				sharedDirectory.get("key1"),
				"value1",
				"Value should be restored by rollback",
			);
			assert.strictEqual(
				sharedDirectory.get("key2"),
				"value2",
				"Value should be restored by rollback",
			);
			assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
			assert.strictEqual(valueChanges[0].key, "key1", "First event should be for key1");
			assert.strictEqual(
				valueChanges[0].previousValue,
				undefined,
				"First event previousValue should be pre-rollback value",
			);
			assert.strictEqual(valueChanges[1].key, "key2", "Second event should be for key2");
			assert.strictEqual(
				valueChanges[1].previousValue,
				undefined,
				"Second event previousValue should be pre-rollback value",
			);
		});

		it("should rollback multiple operations in sequence", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			let valueChanges: IValueChanged[] = [];
			let clears: number = 0;
			sharedDirectory.on("valueChanged", (event: IValueChanged) => {
				valueChanges.push(event);
			});
			sharedDirectory.on("clear", () => {
				clears++;
			});

			sharedDirectory.set("key3", "value3");
			sharedDirectory.delete("key1");
			sharedDirectory.set("key2", "newValue2");
			sharedDirectory.clear();
			sharedDirectory.set("key4", "value4");

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[["key4", "value4"]],
				"Directory should have expected entries pre-rollback",
			);
			assert.deepStrictEqual(
				valueChanges,
				[
					// Set key3
					{ key: "key3", path: "/", previousValue: undefined },
					// Delete key1
					{ key: "key1", path: "/", previousValue: "value1" },
					// Set key2 to a new value
					{ key: "key2", path: "/", previousValue: "value2" },
					// Clear happens here, no valueChange event for clear
					// Set key4
					{ key: "key4", path: "/", previousValue: undefined },
				],
				"Value changes should match expected pre-rollback",
			);
			assert.strictEqual(clears, 1, "Should have one clear event");

			// Reset event monitoring and roll back.
			valueChanges = [];
			clears = 0;
			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key1", "value1"],
					["key2", "value2"],
				],
				"Directory should have expected entries post-rollback",
			);
			assert.deepStrictEqual(
				valueChanges,
				[
					// Roll back the final key4 set
					{ key: "key4", path: "/", previousValue: "value4" },
					// Roll back the clear
					{ key: "key2", path: "/", previousValue: undefined },
					{ key: "key3", path: "/", previousValue: undefined },
					// Roll back the key2 set
					{ key: "key2", path: "/", previousValue: "newValue2" },
					// Roll back the key1 delete
					{ key: "key1", path: "/", previousValue: undefined },
					// Roll back the key3 set
					{ key: "key3", path: "/", previousValue: "value3" },
				],
				"Value changes should match expected post-rollback",
			);
			assert.strictEqual(clears, 0, "Should have no clear events");
		});

		it("should rollback local changes in presence of remote changes from another client", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			// Create a second client
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.set("key3", "value3");
			sharedDirectory.delete("key1");
			sharedDirectory2.set("key4", "value4");
			sharedDirectory2.delete("key2");
			sharedDirectory2.set("key3", "otherValue3");
			sharedDirectory2.set("key1", "otherValue1");

			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					// Note key4 comes before key3 even though we have an optimistic value for it,
					// because sharedDirectory2 set them in that order. Iteration order matches the sequenced perspective.
					["key4", "value4"],
					["key3", "value3"],
				],
				"Directory should have expected entries pre-rollback",
			);

			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key1", "otherValue1"],
					["key4", "value4"],
					["key3", "otherValue3"],
				],
				"Directory should have expected entries post-rollback",
			);
		});
	});

	describe("Storage operations (nested subdirectories)", () => {
		it("should rollback all basic operations (set, delete, clear) in subdirectories and nested subdirectories", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();

			const subDir = sharedDirectory.createSubDirectory("subdir");
			const level1 = sharedDirectory.createSubDirectory("level1");
			const level3 = level1.createSubDirectory("level2").createSubDirectory("level3");
			const absoluteDir = sharedDirectory.getWorkingDirectory("/level1/level2");
			assert(absoluteDir !== undefined, "Absolute path directory should exist");

			subDir.set("existingKey", "existingValue");
			level3.set("deepKey", "deepValue");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const subDirChanges: IValueChanged[] = [];
			const level3Changes: IValueChanged[] = [];
			let clearEvents = 0;

			subDir.on("containedValueChanged", (event: IValueChanged) => subDirChanges.push(event));
			level3.on("containedValueChanged", (event: IValueChanged) => level3Changes.push(event));
			sharedDirectory.on("clear", () => clearEvents++);

			subDir.set("newKey", "newValue");
			subDir.delete("existingKey");
			level3.set("anotherKey", "anotherValue");
			absoluteDir.set("pathKey", "pathValue");
			subDir.clear(); // clear subdir

			const actualState = [
				["subDir.newKey", subDir.get("newKey")],
				["subDir.existingKey", subDir.get("existingKey")],
				["level3.deepKey", level3.get("deepKey")],
				["level3.anotherKey", level3.get("anotherKey")],
				["absoluteDir.pathKey", absoluteDir.get("pathKey")],
			];
			const expectedState = [
				["subDir.newKey", undefined], // Subdir should be cleared
				["subDir.existingKey", undefined], // Subdir should be cleared
				["level3.deepKey", "deepValue"], // Deep key should remain
				["level3.anotherKey", "anotherValue"], // Another key should exist
				["absoluteDir.pathKey", "pathValue"], // Path key should exist
			];
			assert.deepStrictEqual(
				actualState,
				expectedState,
				"Pre-rollback state should match expected values",
			);
			assert.strictEqual(clearEvents, 1, "Should have one clear event");

			containerRuntime.rollback?.();

			const actualState2 = [
				["subDir.newKey", subDir.get("newKey")],
				["subDir.existingKey", subDir.get("existingKey")],
				["level3.deepKey", level3.get("deepKey")],
				["level3.anotherKey", level3.get("anotherKey")],
				["absoluteDir.pathKey", absoluteDir.get("pathKey")],
			];
			const expectedState2 = [
				["subDir.newKey", undefined],
				["subDir.existingKey", "existingValue"],
				["level3.deepKey", "deepValue"],
				["level3.anotherKey", undefined],
				["absoluteDir.pathKey", undefined],
			];
			assert.deepStrictEqual(
				actualState2,
				expectedState2,
				"Post-rollback state should match expected values",
			);

			assert.strictEqual(subDirChanges.length, 5);
			assert.strictEqual(level3Changes.length, 2);
		});

		it("should rollback subdirectory operations with concurrent remote changes", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			const subDir1 = sharedDirectory.createSubDirectory("shared");
			const nestedDir1 = subDir1.createSubDirectory("nested");

			subDir1.set("sharedKey", "initialValue");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const subDir2 = sharedDirectory2.getSubDirectory("shared");
			const nestedDir2 = subDir2?.getSubDirectory("nested");
			assert(
				subDir2 !== undefined && nestedDir2 !== undefined,
				"Subdirectories should exist on second client",
			);

			subDir1.set("localKey", "localValue");
			nestedDir1.set("nestedLocal", "nestedLocalValue");
			subDir2.set("remoteKey", "remoteValue");
			nestedDir2.set("nestedRemote", "nestedRemoteValue");
			subDir2.set("sharedKey", "remoteValue");
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			// Verify pre-rollback state (local optimistic values)
			assert.strictEqual(subDir1.get("localKey"), "localValue", "Local key should exist");
			assert.strictEqual(subDir1.get("remoteKey"), "remoteValue", "Remote key should exist");
			assert.strictEqual(
				subDir1.get("sharedKey"),
				"remoteValue",
				"Pre-rollback state should match expected values",
			);

			containerRuntime.rollback?.();

			const actualState = [
				["localKey", subDir1.get("localKey")],
				["remoteKey", subDir1.get("remoteKey")],
				["sharedKey", subDir1.get("sharedKey")],
				["nestedLocal", nestedDir1.get("nestedLocal")],
				["nestedRemote", nestedDir1.get("nestedRemote")],
			];
			const expectedState = [
				["localKey", undefined],
				["remoteKey", "remoteValue"],
				["sharedKey", "remoteValue"],
				["nestedLocal", undefined],
				["nestedRemote", "nestedRemoteValue"],
			];
			assert.deepStrictEqual(
				actualState,
				expectedState,
				"Post-rollback state should match expected values",
			);
		});

		it("should rollback complex mixed operations across multiple subdirectory levels", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();

			const dirA = sharedDirectory.createSubDirectory("dirA");
			const dirB = sharedDirectory.createSubDirectory("dirB");
			const nestedDir = dirA.createSubDirectory("nested");

			sharedDirectory.set("rootKey", "rootValue");
			dirA.set("dirAKey", "dirAValue");
			dirB.set("dirBKey", "dirBValue");
			nestedDir.set("nestedKey", "nestedValue");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const allValueChanges: IValueChanged[] = [];
			let clearEvents = 0;
			sharedDirectory.on("valueChanged", (event: IValueChanged) =>
				allValueChanges.push(event),
			);
			sharedDirectory.on("clear", () => clearEvents++);

			sharedDirectory.delete("rootKey");
			dirA.set("dirAKey", "modifiedValue");
			dirB.clear();
			nestedDir.set("newKey", "newValue");
			sharedDirectory.set("newRoot", "newValue");
			dirA.delete("dirAKey");

			const actualState = [
				["rootKey", sharedDirectory.get("rootKey")],
				["newRoot", sharedDirectory.get("newRoot")],
				["dirAKey", dirA.get("dirAKey")],
				["dirBKey", dirB.get("dirBKey")],
				["nestedKey", nestedDir.get("nestedKey")],
				["newKey", nestedDir.get("newKey")],
			];
			const expectedState = [
				["rootKey", undefined],
				["newRoot", "newValue"],
				["dirAKey", undefined],
				["dirBKey", undefined],
				["nestedKey", "nestedValue"],
				["newKey", "newValue"],
			];
			assert.deepStrictEqual(
				actualState,
				expectedState,
				"Pre-rollback state should match expected values",
			);
			assert.strictEqual(clearEvents, 1);
			assert.strictEqual(allValueChanges.length, 5);

			containerRuntime.rollback?.();

			const actualState2 = [
				["rootKey", sharedDirectory.get("rootKey")],
				["newRoot", sharedDirectory.get("newRoot")],
				["dirAKey", dirA.get("dirAKey")],
				["dirBKey", dirB.get("dirBKey")],
				["nestedKey", nestedDir.get("nestedKey")],
				["newKey", nestedDir.get("newKey")],
			];
			const expectedState2 = [
				["rootKey", "rootValue"],
				["newRoot", undefined],
				["dirAKey", "dirAValue"],
				["dirBKey", "dirBValue"],
				["nestedKey", "nestedValue"],
				["newKey", undefined],
			];
			assert.deepStrictEqual(
				actualState2,
				expectedState2,
				"Post-rollback state should match expected values",
			);
			assert.strictEqual(clearEvents, 1);
			assert.strictEqual(allValueChanges.length, 11);
		});
	});

	describe("SubDirectory operations", () => {
		it("should rollback create subdirectory", () => {
			const { sharedDirectory, containerRuntime } = setupRollbackTest();

			const createEvents: SubDirectoryEvent[] = [];
			sharedDirectory.on("subDirectoryCreated", (event: SubDirectoryEvent) => {
				createEvents.push(event);
			});

			sharedDirectory.createSubDirectory("subdir1");
			assert(sharedDirectory.getSubDirectory("subdir1") !== undefined);
			assert.strictEqual(createEvents.length, 1);

			containerRuntime.rollback?.();
			assert(sharedDirectory.getSubDirectory("subdir1") === undefined);
			assert.strictEqual(createEvents.length, 1);
		});

		it("should rollback delete subdirectory", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();

			sharedDirectory.createSubDirectory("subdir1");
			const subdir1 = sharedDirectory.getSubDirectory("subdir1");
			assert(subdir1 !== undefined);
			subdir1.set("key", "value");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const deleteEvents: SubDirectoryEvent[] = [];
			sharedDirectory.on("subDirectoryDeleted", (event: SubDirectoryEvent) => {
				deleteEvents.push(event);
			});

			sharedDirectory.deleteSubDirectory("subdir1");
			assert(sharedDirectory.getSubDirectory("subdir1") === undefined);
			assert.strictEqual(deleteEvents.length, 1);

			containerRuntime.rollback?.();
			assert(
				sharedDirectory.getSubDirectory("subdir1") !== undefined,
				"Subdirectory should be restored post-rollback",
			);
			assert.strictEqual(
				subdir1.get("key"),
				"value",
				"key/value should be restored post-rollback",
			);
		});

		it("should rollback create subdirectory, delete subdirectory, and storage operations", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();

			sharedDirectory.createSubDirectory("subdir1");
			const subdir1 = sharedDirectory.getSubDirectory("subdir1");
			assert(subdir1 !== undefined);
			subdir1.set("key1", "value1");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const deleteEvents: SubDirectoryEvent[] = [];
			sharedDirectory.on("subDirectoryDeleted", (event: SubDirectoryEvent) => {
				deleteEvents.push(event);
			});

			subdir1.set("key1", "foo");
			subdir1.set("key2", "value2");
			sharedDirectory.deleteSubDirectory("subdir1");
			assert(sharedDirectory.getSubDirectory("subdir1") === undefined);
			assert.strictEqual(deleteEvents.length, 1);
			assert.strictEqual(subdir1.get("key1"), "foo");
			assert.strictEqual(subdir1.get("key2"), "value2");

			sharedDirectory.createSubDirectory("subdir2");
			const subdir2 = sharedDirectory.getSubDirectory("subdir2");
			assert(subdir2 !== undefined);
			subdir2.set("key3", "value3");
			assert.strictEqual(subdir2.get("key3"), "value3");

			containerRuntime.rollback?.();

			assert(
				sharedDirectory.getSubDirectory("subdir1") !== undefined,
				"subdir1 should be restored post-rollback",
			);
			assert(
				sharedDirectory.getSubDirectory("subdir2") === undefined,
				"subdir2 should not exist post-rollback",
			);
			assert.strictEqual(
				subdir1.get("key1"),
				"value1",
				"subdir1 key1/value1 should be restored post-rollback",
			);
			assert.strictEqual(subdir1.has("key2"), false, "key2 should not exist post-rollback");
		});

		it("should rollback nested subdirectory create operations", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();

			sharedDirectory.createSubDirectory("child");
			const child = sharedDirectory.getSubDirectory("child");
			assert(child !== undefined);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			child.createSubDirectory("grandchild1");
			child.createSubDirectory("grandchild2");
			const grandchild1 = child.getSubDirectory("grandchild1");
			const grandchild2 = child.getSubDirectory("grandchild2");
			assert(
				grandchild1 !== undefined && grandchild2 !== undefined,
				"grandchild directories should exist pre-rollback",
			);

			containerRuntime.rollback?.();

			assert(
				child.getSubDirectory("grandchild1") === undefined &&
					child.getSubDirectory("grandchild2") === undefined,
				"grandchild directories should not exist post-rollback",
			);
		});

		it("should rollback nested subdirectory delete operations", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();

			sharedDirectory.createSubDirectory("child");
			const child = sharedDirectory.getSubDirectory("child");
			assert(child !== undefined);

			child.createSubDirectory("grandchild1");
			child.createSubDirectory("grandchild2");
			const grandchild1 = child.getSubDirectory("grandchild1");
			const grandchild2 = child.getSubDirectory("grandchild2");
			assert(grandchild1 !== undefined && grandchild2 !== undefined);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			child.deleteSubDirectory("grandchild1");
			child.deleteSubDirectory("grandchild2");
			assert(
				child.getSubDirectory("grandchild1") === undefined &&
					child.getSubDirectory("grandchild2") === undefined,
				"grandchild directories should not exist pre-rollback",
			);

			containerRuntime.rollback?.();

			assert(
				child.getSubDirectory("grandchild1") !== undefined &&
					child.getSubDirectory("grandchild2") !== undefined,
				"grandchild directories should exist post-rollback",
			);
		});

		it("should rollback local subdirectory changes with remote changes", () => {
			const {
				sharedDirectory: localClient,
				containerRuntimeFactory,
				containerRuntime: localRuntime,
			} = setupRollbackTest();
			const { sharedDirectory: remoteClient, containerRuntime: remoteRuntime } =
				createAdditionalClient(containerRuntimeFactory);

			localClient.createSubDirectory("existing");
			const existingSubdir = localClient.getSubDirectory("existing");
			assert(existingSubdir !== undefined);
			existingSubdir.set("key", "value");
			localRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Local operations (will be rolled back)
			localClient.createSubDirectory("localCreated");
			localClient.deleteSubDirectory("existing");

			// Remote operations (should persist)
			remoteClient.createSubDirectory("remoteCreated");
			const remoteCreatedSubdir = remoteClient.getSubDirectory("remoteCreated");
			assert(remoteCreatedSubdir !== undefined);
			remoteCreatedSubdir.set("remoteKey", "remoteValue");
			remoteRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Verify pre-rollback
			assert.deepStrictEqual(
				[
					localClient.getSubDirectory("localCreated") === undefined,
					localClient.getSubDirectory("remoteCreated") === undefined,
					localClient.getSubDirectory("existing") === undefined,
					remoteClient.getSubDirectory("localCreated") === undefined,
					remoteClient.getSubDirectory("remoteCreated") === undefined,
					remoteClient.getSubDirectory("existing") === undefined,
				],
				[false, false, true, true, false, false],
				"verify subdirectory state pre-rollback",
			);

			localRuntime.rollback?.();

			// Verify post-rollback (only remote changes persist)
			const existingOnLocal = localClient.getSubDirectory("existing");
			const existingOnRemote = remoteClient.getSubDirectory("existing");
			const remoteCreatedOnLocal = localClient.getSubDirectory("remoteCreated");
			const remoteCreatedOnRemote = remoteClient.getSubDirectory("remoteCreated");
			const localCreatedOnLocal = localClient.getSubDirectory("localCreated");
			const localCreatedOnRemote = remoteClient.getSubDirectory("localCreated");

			// Subdirectory existence checks
			assert.deepStrictEqual(
				[
					existingOnLocal === undefined,
					existingOnRemote === undefined,
					remoteCreatedOnLocal === undefined,
					remoteCreatedOnRemote === undefined,
					localCreatedOnLocal === undefined,
					localCreatedOnRemote === undefined,
				],
				[false, false, false, false, true, true],
				"Subdirectory existence checks failed post-rollback",
			);

			// Key checks
			assert.deepStrictEqual(
				[
					existingOnLocal?.get("key"),
					existingOnRemote?.get("key"),
					remoteCreatedOnLocal?.get("remoteKey"),
					remoteCreatedOnRemote?.get("remoteKey"),
				],
				["value", "value", "remoteValue", "remoteValue"],
				"Subdirectory key values should match expected values post-rollback",
			);
		});

		it("should rollback local subdirectory changes with remote changes and storage operations", () => {
			const {
				sharedDirectory: localClient,
				containerRuntimeFactory,
				containerRuntime: localRuntime,
			} = setupRollbackTest();
			const { sharedDirectory: remoteClient, containerRuntime: remoteRuntime } =
				createAdditionalClient(containerRuntimeFactory);

			localClient.createSubDirectory("existing");
			const existingSubdir = localClient.getSubDirectory("existing");
			assert(existingSubdir !== undefined);
			existingSubdir.set("key", "value");
			localRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Local operations (will be rolled back)
			localClient.createSubDirectory("localCreated");
			localClient.deleteSubDirectory("existing");

			// Remote operations (should persist)
			remoteClient.createSubDirectory("remoteCreated");
			const remoteCreatedSubdir = remoteClient.getSubDirectory("remoteCreated");
			assert(remoteCreatedSubdir !== undefined);
			remoteCreatedSubdir.set("remoteKey", "remoteValue");
			const existingFromRemote = remoteClient.getSubDirectory("existing");
			assert(existingFromRemote !== undefined);
			existingFromRemote.set("key", "foo");
			existingFromRemote.set("key2", "value2");
			remoteRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Verify pre-rollback
			assert.deepStrictEqual(
				[
					localClient.getSubDirectory("localCreated") === undefined,
					localClient.getSubDirectory("remoteCreated") === undefined,
					localClient.getSubDirectory("existing") === undefined,
					remoteClient.getSubDirectory("localCreated") === undefined,
					remoteClient.getSubDirectory("remoteCreated") === undefined,
					remoteClient.getSubDirectory("existing") === undefined,
				],
				[false, false, true, true, false, false],
				"verify subdirectory state pre-rollback",
			);

			localRuntime.rollback?.();

			// Verify post-rollback (only remote changes persist)
			const existingOnLocal = localClient.getSubDirectory("existing");
			const existingOnRemote = remoteClient.getSubDirectory("existing");
			const remoteCreatedOnLocal = localClient.getSubDirectory("remoteCreated");
			const remoteCreatedOnRemote = remoteClient.getSubDirectory("remoteCreated");
			const localCreatedOnLocal = localClient.getSubDirectory("localCreated");
			const localCreatedOnRemote = remoteClient.getSubDirectory("localCreated");

			// Subdirectory existence checks
			assert.deepStrictEqual(
				[
					existingOnLocal === undefined,
					existingOnRemote === undefined,
					remoteCreatedOnLocal === undefined,
					remoteCreatedOnRemote === undefined,
					localCreatedOnLocal === undefined,
					localCreatedOnRemote === undefined,
				],
				[false, false, false, false, true, true],
				"Subdirectory existence checks failed post-rollback",
			);

			// Extra asserts to make compiler happy (doesn't recognize above asserts)
			assert(
				existingOnRemote && remoteCreatedOnRemote && existingOnLocal && remoteCreatedOnLocal,
			);

			assert.deepStrictEqual(
				[[...existingOnLocal.entries()], [...remoteCreatedOnLocal.entries()]],
				[
					[
						["key", "foo"],
						["key2", "value2"],
					],
					[["remoteKey", "remoteValue"]],
				],
				"Subdirectory entries on local client should match expected values post-rollback",
			);
			assert.deepStrictEqual(
				[[...existingOnRemote.entries()], [...remoteCreatedOnRemote.entries()]],
				[
					[
						["key", "foo"],
						["key2", "value2"],
					],
					[["remoteKey", "remoteValue"]],
				],
				"Subdirectory entries on remote client should match expected values post-rollback",
			);
		});
	});

	describe("Events", () => {
		it("should fire correct events for rollback of local delete", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();

			let disposedCount = 0;
			let undisposedCount = 0;
			let subdirDeletedCount = 0;
			let subdirCreatedCount = 0;

			sharedDirectory.createSubDirectory("subdir");
			const subdir = sharedDirectory.getSubDirectory("subdir");
			assert(subdir !== undefined);
			subdir.on("disposed", () => {
				disposedCount++;
			});
			subdir.on("undisposed", () => {
				undisposedCount++;
			});
			sharedDirectory.on("subDirectoryCreated", (path: string) => {
				if (path === "subdir") {
					subdirCreatedCount++;
				}
			});
			sharedDirectory.on("subDirectoryDeleted", (path: string) => {
				if (path === "subdir") {
					subdirDeletedCount++;
				}
			});

			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.deleteSubDirectory("subdir");
			assert.strictEqual(disposedCount, 1, "disposed should fire once on local delete");
			assert.strictEqual(
				subdirDeletedCount,
				1,
				"subdirDeleted should fire once on local delete",
			);

			containerRuntime.rollback?.();

			assert.strictEqual(undisposedCount, 1, "undisposed should fire once on rollback");
			assert.strictEqual(subdirCreatedCount, 1, "subdirCreated should fire once on rollback");
		});

		it("should fire correct events for rollback of local delete across nested subdirectories", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();

			let rootDeleted = 0;
			let rootCreated = 0;
			let parentCreated = 0;
			let parentDeleted = 0;
			let childCreated = 0;
			let childDeleted = 0;
			let childDisposed = 0;
			let childUndisposed = 0;
			let grandchildDisposed = 0;
			let grandchildUndisposed = 0;

			sharedDirectory.on("subDirectoryDeleted", (path: string) => {
				if (path === "parent") {
					rootDeleted++;
				}
			});
			sharedDirectory.on("subDirectoryCreated", (path: string) => {
				if (path === "parent") {
					rootCreated++;
				}
			});
			sharedDirectory.createSubDirectory("parent");
			const parent = sharedDirectory.getSubDirectory("parent");
			assert(parent !== undefined);

			parent.on("subDirectoryCreated", (path: string) => {
				if (path === "child") {
					parentCreated++;
				}
			});
			parent.on("subDirectoryDeleted", (path: string) => {
				if (path === "child") {
					parentDeleted++;
				}
			});

			const child = parent.createSubDirectory("child");
			assert(child !== undefined);

			child.on("subDirectoryCreated", (path: string) => {
				if (path === "grandchild") {
					childCreated++;
				}
			});
			child.on("subDirectoryDeleted", (path: string) => {
				if (path === "grandchild") {
					childDeleted++;
				}
			});
			child.on("disposed", () => {
				childDisposed++;
			});
			child.on("undisposed", () => {
				childUndisposed++;
			});

			const grandchild = child.createSubDirectory("grandchild");
			assert(grandchild !== undefined);
			grandchild.on("disposed", () => {
				grandchildDisposed++;
			});
			grandchild.on("undisposed", () => {
				grandchildUndisposed++;
			});

			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			parent.deleteSubDirectory("child");

			assert.deepStrictEqual(
				[rootCreated, rootDeleted],
				[1, 0],
				"root events correct pre-rollback",
			);
			assert.deepStrictEqual(
				[parentCreated, parentDeleted],
				[1, 1],
				"parent events correct pre-rollback",
			);
			assert.deepStrictEqual(
				[childCreated, childDeleted, childDisposed, childUndisposed],
				[1, 0, 1, 0],
				"child events correct pre-rollback",
			);
			assert.deepStrictEqual(
				[grandchildDisposed, grandchildUndisposed],
				[1, 0],
				"grandchild events correct pre-rollback",
			);

			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[rootCreated, rootDeleted],
				[1, 0],
				"root events correct post-rollback",
			);
			assert.deepStrictEqual(
				[parentCreated, parentDeleted],
				[2, 1],
				"parent events correct post-rollback",
			);
			assert.deepStrictEqual(
				[childCreated, childDeleted, childDisposed, childUndisposed],
				[1, 0, 1, 1],
				"child events correct post-rollback",
			);
			assert.deepStrictEqual(
				[grandchildDisposed, grandchildUndisposed],
				[1, 1],
				"grandchild events correct post-rollback",
			);
		});
	});
});
