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
	describe("Storage operations", () => {
		it("should rollback set operation", () => {
			const { sharedDirectory, containerRuntime } = setupRollbackTest();
			const valueChanges: IValueChanged[] = [];
			sharedDirectory.on("valueChanged", (event) => valueChanges.push(event));

			sharedDirectory.set("key1", "value1");
			assert.strictEqual(sharedDirectory.get("key1"), "value1");
			assert.strictEqual(valueChanges.length, 1);

			containerRuntime.rollback?.();
			assert.strictEqual(sharedDirectory.has("key1"), false);
			assert.strictEqual(sharedDirectory.get("key1"), undefined);
			assert.strictEqual(valueChanges.length, 2);
			assert.strictEqual(valueChanges[1].key, "key1");
			assert.strictEqual(valueChanges[1].previousValue, "value1");
		});

		it("should rollback delete operation", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			sharedDirectory.set("key1", "value1");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const valueChanges: IValueChanged[] = [];
			sharedDirectory.on("valueChanged", (event) => valueChanges.push(event));

			sharedDirectory.delete("key1");
			assert.strictEqual(sharedDirectory.get("key1"), undefined);
			assert.strictEqual(valueChanges.length, 1);

			containerRuntime.rollback?.();
			assert.strictEqual(sharedDirectory.has("key1"), true);
			assert.strictEqual(sharedDirectory.get("key1"), "value1");
			assert.strictEqual(valueChanges.length, 2);
			assert.strictEqual(valueChanges[1].key, "key1");
			assert.strictEqual(valueChanges[1].previousValue, undefined);
		});

		it("should rollback clear operation", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const valueChanges: IValueChanged[] = [];
			let clearCount = 0;
			sharedDirectory.on("valueChanged", (event) => valueChanges.push(event));
			sharedDirectory.on("clear", () => clearCount++);

			sharedDirectory.clear();

			assert.strictEqual(sharedDirectory.get("key1"), undefined);
			assert.strictEqual(sharedDirectory.get("key2"), undefined);
			assert.strictEqual(valueChanges.length, 0);
			assert.strictEqual(clearCount, 1);

			containerRuntime.rollback?.();
			assert.strictEqual(sharedDirectory.has("key1"), true);
			assert.strictEqual(sharedDirectory.has("key2"), true);
			assert.strictEqual(sharedDirectory.get("key1"), "value1");
			assert.strictEqual(sharedDirectory.get("key2"), "value2");
			assert.strictEqual(valueChanges.length, 2);
			assert.strictEqual(valueChanges[0].key, "key1");
			assert.strictEqual(valueChanges[0].previousValue, undefined);
			assert.strictEqual(valueChanges[1].key, "key2");
			assert.strictEqual(valueChanges[1].previousValue, undefined);
		});

		it("should rollback multiple operations in sequence", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			let valueChanges: IValueChanged[] = [];
			let clearCount = 0;
			sharedDirectory.on("valueChanged", (event) => valueChanges.push(event));
			sharedDirectory.on("clear", () => clearCount++);

			sharedDirectory.set("key3", "value3");
			sharedDirectory.delete("key1");
			sharedDirectory.set("key2", "newValue2");
			sharedDirectory.clear();
			sharedDirectory.set("key4", "value4");

			assert.deepStrictEqual([...sharedDirectory.entries()], [["key4", "value4"]]);
			assert.deepStrictEqual(valueChanges, [
				{ key: "key3", path: "/", previousValue: undefined },
				{ key: "key1", path: "/", previousValue: "value1" },
				{ key: "key2", path: "/", previousValue: "value2" },
				{ key: "key4", path: "/", previousValue: undefined },
			]);
			assert.strictEqual(clearCount, 1);

			valueChanges = [];
			clearCount = 0;
			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key1", "value1"],
					["key2", "value2"],
				],
			);
			assert.deepStrictEqual(valueChanges, [
				{ key: "key4", path: "/", previousValue: "value4" },
				{ key: "key2", path: "/", previousValue: undefined },
				{ key: "key3", path: "/", previousValue: undefined },
				{ key: "key2", path: "/", previousValue: "newValue2" },
				{ key: "key1", path: "/", previousValue: undefined },
				{ key: "key3", path: "/", previousValue: "value3" },
			]);
			assert.strictEqual(clearCount, 0);
		});

		it("should rollback local changes with remote changes", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			const { sharedDirectory: remote, containerRuntime: remoteRuntime } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("key1", "value1");
			sharedDirectory.set("key2", "value2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Local operations
			sharedDirectory.set("key3", "value3");
			sharedDirectory.delete("key1");

			// Remote operations
			remote.set("key4", "value4");
			remote.delete("key2");
			remote.set("key3", "otherValue3");
			remote.set("key1", "otherValue1");

			remoteRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key4", "value4"],
					["key3", "value3"],
				],
			);

			containerRuntime.rollback?.();

			assert.deepStrictEqual(
				[...sharedDirectory.entries()],
				[
					["key1", "otherValue1"],
					["key4", "value4"],
					["key3", "otherValue3"],
				],
			);
		});
	});

	describe("Subdirectory operations", () => {
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
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			const { sharedDirectory: remote, containerRuntime: remoteRuntime } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.createSubDirectory("subdir1");
			const subdir1 = sharedDirectory.getSubDirectory("subdir1");
			assert(subdir1 !== undefined);
			subdir1.set("key", "value");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Local operations (will be rolled back)
			sharedDirectory.createSubDirectory("local");
			sharedDirectory.deleteSubDirectory("subdir1");

			// Remote operations (should persist)
			remote.createSubDirectory("remote");
			const remoteDir = remote.getSubDirectory("remote");
			assert(remoteDir !== undefined);
			remoteDir.set("remoteKey", "remoteValue");
			remoteRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Verify pre-rollback
			assert(
				sharedDirectory.getSubDirectory("local") !== undefined &&
					sharedDirectory.getSubDirectory("remote") !== undefined &&
					sharedDirectory.getSubDirectory("subdir1") === undefined,
				"verify local subdir state pre-rollback",
			);
			assert(
				remote.getSubDirectory("local") === undefined &&
					remote.getSubDirectory("remote") !== undefined &&
					remote.getSubDirectory("subdir1") !== undefined,
				"verify remote subdir state pre-rollback",
			);

			containerRuntime.rollback?.();

			// Verify post-rollback (only remote changes persist)
			const localSubdir1 = sharedDirectory.getSubDirectory("subdir1");
			const remoteSubdir1 = remote.getSubDirectory("subdir1");
			const localRemote = sharedDirectory.getSubDirectory("remote");
			const remoteRemote = remote.getSubDirectory("remote");
			const localLocal = sharedDirectory.getSubDirectory("local");
			const remoteLocal = remote.getSubDirectory("local");

			// Subdirectory existence checks
			assert(
				localSubdir1 !== undefined && remoteSubdir1 !== undefined,
				"subdir1 should exist post-rollback",
			);
			assert(
				localRemote !== undefined && remoteRemote !== undefined,
				"remote subdir should exist post-rollback",
			);
			assert(
				localLocal === undefined && remoteLocal === undefined,
				"local subdir should not exist post-rollback",
			);

			// Key checks
			assert.strictEqual(
				localSubdir1.get("key"),
				"value",
				"localSubdir1 key/value should exist post-rollback",
			);
			assert.strictEqual(
				remoteSubdir1.get("key"),
				"value",
				"remoteSubdir1 key/value should exist post-rollback",
			);
			assert.strictEqual(
				localRemote.get("remoteKey"),
				"remoteValue",
				"localRemote key/value should exist post-rollback",
			);
			assert.strictEqual(
				remoteRemote.get("remoteKey"),
				"remoteValue",
				"remoteRemote key/value should exist post-rollback",
			);
		});

		it("should rollback local subdirectory changes with remote changes and storage operations", () => {
			const { sharedDirectory, containerRuntimeFactory, containerRuntime } =
				setupRollbackTest();
			const { sharedDirectory: remote, containerRuntime: remoteRuntime } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.createSubDirectory("subdir1");
			const subdir1 = sharedDirectory.getSubDirectory("subdir1");
			assert(subdir1 !== undefined);
			subdir1.set("key", "value");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Local operations (will be rolled back)
			sharedDirectory.createSubDirectory("local");
			sharedDirectory.deleteSubDirectory("subdir1");

			// Remote operations (should persist)
			remote.createSubDirectory("remote");
			const remoteDir = remote.getSubDirectory("remote");
			assert(remoteDir !== undefined);
			remoteDir.set("remoteKey", "remoteValue");
			remoteDir.set("key", "foo");
			remoteDir.set("key2", "value2");
			remoteRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Verify pre-rollback
			assert(
				sharedDirectory.getSubDirectory("local") !== undefined &&
					sharedDirectory.getSubDirectory("remote") !== undefined &&
					sharedDirectory.getSubDirectory("subdir1") === undefined,
				"verify subdir state pre-rollback",
			);

			containerRuntime.rollback?.();

			// Verify post-rollback (only remote changes persist)
			const localSubdir1 = sharedDirectory.getSubDirectory("subdir1");
			const remoteSubdir1 = remote.getSubDirectory("subdir1");
			const localRemote = sharedDirectory.getSubDirectory("remote");
			const remoteRemote = remote.getSubDirectory("remote");
			const localLocal = sharedDirectory.getSubDirectory("local");
			const remoteLocal = remote.getSubDirectory("local");

			// Subdirectory existence checks
			assert(
				localSubdir1 !== undefined && remoteSubdir1 !== undefined,
				"subdir1 should exist post-rollback",
			);
			assert(
				localRemote !== undefined && remoteRemote !== undefined,
				"remote subdir should exist post-rollback",
			);
			assert(
				localLocal === undefined && remoteLocal === undefined,
				"local subdir should not exist post-rollback",
			);

			// Key checks
			assert.strictEqual(
				localSubdir1.get("key"),
				"foo",
				"local subdir1 key should be set to foo post-rollback",
			);
			assert.strictEqual(
				remoteSubdir1.get("key"),
				"foo",
				"remote subdir1 key should be set to foo post-rollback",
			);
			assert.strictEqual(
				localSubdir1.get("key2"),
				"value2",
				"local subdir1 key2 should be set to value2 post-rollback",
			);
			assert.strictEqual(
				remoteSubdir1.get("key2"),
				"value2",
				"remote subdir1 key2 should be set to value2 post-rollback",
			);
			assert.strictEqual(
				remoteRemote.get("remoteKey"),
				"remoteValue",
				"local subdir1 remoteKey should be set to remoteValue post-rollback",
			);
			assert.strictEqual(
				remoteRemote.get("remoteKey"),
				"remoteValue",
				"remote subdir1 remoteKey should be set to remoteValue post-rollback",
			);
		});
	});
});
