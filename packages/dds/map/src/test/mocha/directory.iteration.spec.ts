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
import type { ISharedDirectory } from "../../interfaces.js";

interface TestParts {
	sharedDirectory: ISharedDirectory;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
	containerRuntime: MockContainerRuntime;
}

const directoryFactory = new DirectoryFactory();

function setupTest(): TestParts {
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

describe("SharedDirectory iteration", () => {
	it("should have eventually consistent iteration order between clients when simultaneous set", () => {
		const { sharedDirectory, containerRuntimeFactory, containerRuntime } = setupTest();
		// Create a second client
		const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);

		sharedDirectory.set("key1", "value1");
		sharedDirectory.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		sharedDirectory.set("key3", "value3");
		sharedDirectory2.set("key4", "value4");
		containerRuntime.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		const keys1 = [...sharedDirectory.keys()];
		const keys2 = [...sharedDirectory2.keys()];

		assert.deepStrictEqual(
			keys1,
			["key1", "key2", "key3", "key4"],
			"Keys should match expected",
		);
		assert.deepStrictEqual(keys1, keys2, "Keys should match between clients");
	});

	it("should have eventually consistent iteration order between clients when suppressed delete", () => {
		const { sharedDirectory, containerRuntimeFactory, containerRuntime } = setupTest();
		// Create a second client
		const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);

		sharedDirectory.set("key1", "value1");
		sharedDirectory.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		// sharedDirectory2 won't observe the delete of key1, it is suppressed since there is a pending set of the
		// same key.  But it should move to the end of the iteration order since the sequenced perspective
		// is that it was deleted and re-added.
		sharedDirectory.delete("key1");
		sharedDirectory2.set("key1", "otherValue1");
		containerRuntime.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		const keys1 = [...sharedDirectory.keys()];
		const keys2 = [...sharedDirectory2.keys()];

		assert.deepStrictEqual(keys1, ["key2", "key1"], "Keys should match expected");
		assert.deepStrictEqual(keys1, keys2, "Keys should match between clients");
	});

	it("should have eventually consistent iteration order between clients when clear", () => {
		const { sharedDirectory, containerRuntimeFactory, containerRuntime } = setupTest();
		// Create a second client
		const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);

		sharedDirectory.set("key1", "value1");
		sharedDirectory.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		// sharedDirectory's clear() changes the effect of sharedDirectory2's set() of key1 (it becomes a
		// re-add instead of a modification). Its new iteration order should reflect the new
		// lifetime created by the re-add.
		sharedDirectory.clear();
		sharedDirectory2.set("key3", "value3");
		sharedDirectory2.set("key1", "otherValue1");
		sharedDirectory2.set("key4", "value4");
		containerRuntime.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		const keys1 = [...sharedDirectory.keys()];
		const keys2 = [...sharedDirectory2.keys()];

		assert.deepStrictEqual(keys1, ["key3", "key1", "key4"], "Keys should match expected");
		assert.deepStrictEqual(keys1, keys2, "Keys should match between clients");
	});

	it("should have eventually consistent iteration order with nested subdirectory operations", () => {
		const { sharedDirectory, containerRuntimeFactory, containerRuntime } = setupTest();
		const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);

		sharedDirectory.set("rootKey1", "rootValue1");
		const subDir1 = sharedDirectory.createSubDirectory("subdir");
		subDir1.set("subKey1", "subValue1");
		sharedDirectory.set("rootKey2", "rootValue2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		const subDir2 = sharedDirectory2.getSubDirectory("subdir");
		assert(subDir2 !== undefined, "Subdirectory should exist on second client");

		sharedDirectory.set("rootKey3", "rootValue3");
		subDir1.set("subKey2", "subValue2");
		sharedDirectory2.set("rootKey4", "rootValue4");
		subDir2.set("subKey3", "subValue3");
		sharedDirectory.delete("rootKey1");
		subDir1.delete("subKey1");
		sharedDirectory2.set("rootKey1", "newRootValue1");

		containerRuntime.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		const rootKeys1 = [...sharedDirectory.keys()];
		const rootKeys2 = [...sharedDirectory2.keys()];

		assert.deepStrictEqual(
			rootKeys1,
			["rootKey2", "rootKey3", "rootKey4", "rootKey1"],
			"Root keys should match expected order",
		);
		assert.deepStrictEqual(rootKeys1, rootKeys2, "Root keys should match between clients");

		const subKeys1 = [...subDir1.keys()];
		const subKeys2 = [...subDir2.keys()];

		assert.deepStrictEqual(
			subKeys1,
			["subKey2", "subKey3"],
			"Subdirectory keys should match expected order",
		);
		assert.deepStrictEqual(
			subKeys1,
			subKeys2,
			"Subdirectory keys should match between clients",
		);
	});
});
