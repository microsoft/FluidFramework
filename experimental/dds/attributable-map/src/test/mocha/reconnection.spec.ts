/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { ISharedMap } from "../../interfaces.js";
import { AttributableMapClass, MapFactory } from "../../map.js";

describe("Reconnection", () => {
	describe("SharedMap", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let map1: ISharedMap;
		let map2: ISharedMap;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Create the first SharedMap.
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			map1 = new AttributableMapClass(
				"shared-map-1",
				dataStoreRuntime1,
				MapFactory.Attributes,
			);
			map1.connect(services1);

			// Create the second SharedMap.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			map2 = new AttributableMapClass(
				"shared-map-2",
				dataStoreRuntime2,
				MapFactory.Attributes,
			);
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
});
