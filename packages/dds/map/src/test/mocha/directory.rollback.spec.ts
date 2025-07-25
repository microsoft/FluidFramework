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
	it("should rollback set operation", () => {
		const { sharedDirectory, containerRuntime } = setupRollbackTest();
		const valueChanges: IValueChanged[] = [];
		sharedDirectory.on("valueChanged", (event: IValueChanged) => {
			valueChanges.push(event);
		});
		sharedDirectory.set("key1", "value1");
		assert.strictEqual(sharedDirectory.get("key1"), "value1", "Failed getting pending value");
		assert.strictEqual(valueChanges.length, 1, "Should have one value change event");
		containerRuntime.rollback?.();
		assert.strictEqual(sharedDirectory.get("key1"), undefined, "Value should be rolled back");
		assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
		assert.strictEqual(valueChanges[1].key, "key1", "Second event should be for key1");
		assert.strictEqual(
			valueChanges[1].previousValue,
			"value1",
			"Second event previousValue should be pre-rollback value",
		);
	});

	it("should rollback delete operation", () => {
		const { sharedDirectory, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
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
		const { sharedDirectory, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
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
		const { sharedDirectory, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
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
		const { sharedDirectory, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
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
