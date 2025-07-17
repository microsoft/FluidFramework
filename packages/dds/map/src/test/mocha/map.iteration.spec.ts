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

import type { ISharedMap } from "../../interfaces.js";
import { MapFactory } from "../../mapFactory.js";

interface TestParts {
	sharedMap: ISharedMap;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
	containerRuntime: MockContainerRuntime;
}

const mapFactory = new MapFactory();

function setupTest(): TestParts {
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

describe("SharedMap iteration", () => {
	it("should have eventually consistent iteration order between clients when simultaneous set", () => {
		const { sharedMap, containerRuntimeFactory, containerRuntime } = setupTest();
		// Create a second client
		const { sharedMap: sharedMap2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);

		sharedMap.set("key1", "value1");
		sharedMap.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		sharedMap.set("key3", "value3");
		sharedMap2.set("key4", "value4");
		containerRuntime.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		const keys1 = [...sharedMap.keys()];
		const keys2 = [...sharedMap2.keys()];

		assert.deepEqual(keys1, ["key1", "key2", "key3", "key4"], "Keys should match expected");
		assert.deepEqual(keys1, keys2, "Keys should match between clients");
	});

	it("should have eventually consistent iteration order between clients when suppressed delete", () => {
		const { sharedMap, containerRuntimeFactory, containerRuntime } = setupTest();
		// Create a second client
		const { sharedMap: sharedMap2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);

		sharedMap.set("key1", "value1");
		sharedMap.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		// sharedMap2 won't observe the delete of key1, it is suppressed since there is a pending set of the
		// same key.  But it should move to the end of the iteration order since the sequenced perspective
		// is that it was deleted and re-added.
		sharedMap.delete("key1");
		sharedMap2.set("key1", "otherValue1");
		containerRuntime.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		const keys1 = [...sharedMap.keys()];
		const keys2 = [...sharedMap2.keys()];

		assert.deepEqual(keys1, ["key2", "key1"], "Keys should match expected");
		assert.deepEqual(keys1, keys2, "Keys should match between clients");
	});

	it("should have eventually consistent iteration order between clients when clear", () => {
		const { sharedMap, containerRuntimeFactory, containerRuntime } = setupTest();
		// Create a second client
		const { sharedMap: sharedMap2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);

		sharedMap.set("key1", "value1");
		sharedMap.set("key2", "value2");
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		// sharedMap's clear() changes the effect of sharedMap2's set() of key1 (it becomes a
		// re-add instead of a modification). Its new iteration order should reflect the new
		// lifetime created by the re-add.
		sharedMap.clear();
		sharedMap2.set("key3", "value3");
		sharedMap2.set("key1", "otherValue1");
		sharedMap2.set("key4", "value4");
		containerRuntime.flush();
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();

		const keys1 = [...sharedMap.keys()];
		const keys2 = [...sharedMap2.keys()];

		assert.deepEqual(keys1, ["key3", "key1", "key4"], "Keys should match expected");
		assert.deepEqual(keys1, keys2, "Keys should match between clients");
	});
});
