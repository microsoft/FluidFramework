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

import type { ISharedMap, IValueChanged } from "../../interfaces.js";
import { MapFactory } from "../../mapFactory.js";

interface RollbackTestSetup {
	sharedMap: ISharedMap;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
	containerRuntime: MockContainerRuntime;
}

const mapFactory = new MapFactory();

function setupRollbackTest(): RollbackTestSetup {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 }); // TurnBased
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedMap = mapFactory.create(dataStoreRuntime, "shared-map-1");
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedMap.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return {
		sharedMap,
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
	sharedMap: ISharedMap;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntime;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedMap = mapFactory.create(dataStoreRuntime, `shared-map-${id}`);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedMap.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return { sharedMap, dataStoreRuntime, containerRuntime };
}

describe("SharedMap rollback", () => {
	it("should rollback set operation", () => {
		const { sharedMap, containerRuntime } = setupRollbackTest();
		const valueChanges: IValueChanged[] = [];
		sharedMap.on("valueChanged", (event: IValueChanged) => {
			valueChanges.push(event);
		});
		sharedMap.set("key1", "value1");
		assert.strictEqual(sharedMap.get("key1"), "value1", "Failed getting pending value");
		assert.strictEqual(valueChanges.length, 1, "Should have one value change event");
		containerRuntime.rollback?.();
		assert.strictEqual(sharedMap.get("key1"), undefined, "Value should be rolled back");
		assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
		assert.strictEqual(valueChanges[1].key, "key1", "Second event should be for key1");
		assert.strictEqual(
			valueChanges[1].previousValue,
			"value1",
			"Second event previousValue should be pre-rollback value",
		);
	});

	it("should rollback delete operation", () => {
		const { sharedMap, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
		sharedMap.set("key1", "value1");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		const valueChanges: IValueChanged[] = [];
		sharedMap.on("valueChanged", (event: IValueChanged) => {
			valueChanges.push(event);
		});
		sharedMap.delete("key1");
		assert.strictEqual(
			sharedMap.get("key1"),
			undefined,
			"Pending value should reflect the delete",
		);
		assert.strictEqual(valueChanges.length, 1, "Should have one value change event");
		containerRuntime.rollback?.();
		assert.strictEqual(
			sharedMap.get("key1"),
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
		const { sharedMap, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
		sharedMap.set("key1", "value1");
		sharedMap.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		const valueChanges: IValueChanged[] = [];
		let clears: number = 0;
		sharedMap.on("valueChanged", (event: IValueChanged) => {
			valueChanges.push(event);
		});
		sharedMap.on("clear", () => {
			clears++;
		});

		sharedMap.clear();

		assert.strictEqual(
			sharedMap.get("key1"),
			undefined,
			"Pending value for key1 should reflect the clear",
		);
		assert.strictEqual(
			sharedMap.get("key2"),
			undefined,
			"Pending value for key2 should reflect the clear",
		);
		assert.strictEqual(valueChanges.length, 0, "Should have no value change events");
		assert.strictEqual(clears, 1, "Should have one clear event");
		containerRuntime.rollback?.();
		assert.strictEqual(
			sharedMap.get("key1"),
			"value1",
			"Value should be restored by rollback",
		);
		assert.strictEqual(
			sharedMap.get("key2"),
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
		const { sharedMap, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
		sharedMap.set("key1", "value1");
		sharedMap.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		const valueChanges: IValueChanged[] = [];
		const expectedValueChanges: IValueChanged[] = [
			// Set key3
			{ key: "key3", previousValue: undefined },
			// Delete key1
			{ key: "key1", previousValue: "value1" },
			// Set key2 to a new value
			{ key: "key2", previousValue: "value2" },
			// Clear happens here, no valueChange event for clear
			// Set key4
			{ key: "key4", previousValue: undefined },
			// Roll back the final key4 set
			{ key: "key4", previousValue: "value4" },
			// Roll back the clear
			{ key: "key2", previousValue: undefined },
			{ key: "key3", previousValue: undefined },
			// Roll back the key2 set
			{ key: "key2", previousValue: "newValue2" },
			// Roll back the key1 delete
			{ key: "key1", previousValue: undefined },
			// Roll back the key3 set
			{ key: "key3", previousValue: "value3" },
		];
		let clears: number = 0;
		sharedMap.on("valueChanged", (event: IValueChanged) => {
			valueChanges.push(event);
		});
		sharedMap.on("clear", () => {
			clears++;
		});

		sharedMap.set("key3", "value3");
		sharedMap.delete("key1");
		sharedMap.set("key2", "newValue2");
		sharedMap.clear();
		sharedMap.set("key4", "value4");

		assert.strictEqual(sharedMap.get("key1"), undefined, "key1 should be deleted");
		assert.strictEqual(sharedMap.get("key2"), undefined, "key2 should be cleared");
		assert.strictEqual(sharedMap.get("key3"), undefined, "key3 should be cleared");
		assert.strictEqual(sharedMap.get("key4"), "value4", "key4 should be set");
		assert.strictEqual(valueChanges.length, 4, "Should have four value change events");
		assert.strictEqual(clears, 1, "Should have one clear event");
		containerRuntime.rollback?.();
		assert.strictEqual(sharedMap.get("key1"), "value1", "key1 should be restored");
		assert.strictEqual(sharedMap.get("key2"), "value2", "key2 should be restored");
		assert.strictEqual(sharedMap.get("key3"), undefined, "key3 should be removed");
		assert.strictEqual(sharedMap.get("key4"), undefined, "key4 should be removed");
		assert.strictEqual(valueChanges.length, 10, "Should have ten value change events");
		assert.strictEqual(clears, 1, "Should still have one clear event");

		assert.deepEqual(
			valueChanges,
			expectedValueChanges,
			"Value changes should match expected",
		);
	});

	it("should rollback local changes in presence of remote changes from another client", () => {
		const { sharedMap, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
		// Create a second client
		const { sharedMap: sharedMap2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);

		sharedMap.set("key1", "value1");
		sharedMap.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		sharedMap.set("key3", "value3");
		sharedMap.delete("key1");
		sharedMap2.set("key4", "value4");
		sharedMap2.delete("key2");
		sharedMap2.set("key3", "otherValue3");
		sharedMap2.set("key1", "otherValue1");

		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		assert.strictEqual(sharedMap.get("key1"), undefined, "key1 should appear deleted locally");
		assert.strictEqual(sharedMap.get("key2"), undefined, "key2 is deleted");
		assert.strictEqual(
			sharedMap.get("key3"),
			"value3",
			"key3 should appear as value3 locally",
		);
		assert.strictEqual(sharedMap.get("key4"), "value4", "key4 should be set to value4");

		containerRuntime.rollback?.();
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		assert.strictEqual(
			sharedMap.get("key1"),
			"otherValue1",
			"key1 should roll back to remotely set value",
		);
		assert.strictEqual(sharedMap.get("key2"), undefined, "key2 is still deleted");
		assert.strictEqual(
			sharedMap.get("key3"),
			"otherValue3",
			"key3 should roll back to remotely set value",
		);
		assert.strictEqual(sharedMap.get("key4"), "value4", "key4 should still be set to value4");
	});
});
