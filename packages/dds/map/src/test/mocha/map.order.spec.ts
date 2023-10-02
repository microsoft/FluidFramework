/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { MapFactory, SharedMap } from "../../map";
import { createConnectedMap, createLocalMap } from "./mapUtils";

describe("Map Iteration Order", () => {
	describe("Local state", () => {
		let map: SharedMap;

		beforeEach(async () => {
			map = createLocalMap("testMap");
		});

		it("set", () => {
			map.set("2", 1);
			map.set("1", 2);
			map.set("3", 3);

			assert.deepEqual(Array.from(map.keys()), ["2", "1", "3"]);
			assert.deepEqual(Array.from(map.values()), [1, 2, 3]);
		});

		it("set with value overwritting", () => {
			map.set("2", 1);
			map.set("1", 2);
			map.set("3", 3);
			map.set("1", 4);
			map.set("4", 5);
			map.set("2", 6);

			assert.deepEqual(Array.from(map.keys()), ["2", "1", "3", "4"]);
			assert.deepEqual(Array.from(map.values()), [6, 4, 3, 5]);
		});

		it("delete", () => {
			map.delete("3");
			map.set("2", 1);
			map.set("1", 2);
			map.set("3", 3);

			map.delete("1");
			assert.deepEqual(Array.from(map.keys()), ["2", "3"]);

			map.set("1", 4);
			assert.deepEqual(Array.from(map.keys()), ["2", "3", "1"]);
			assert.deepEqual(Array.from(map.values()), [1, 3, 4]);
		});

		it("clear", () => {
			map.set("2", 1);
			map.set("1", 2);
			map.set("3", 3);

			map.clear();
			assert.deepEqual(Array.from(map.keys()), []);
			assert.deepEqual(Array.from(map.values()), []);

			map.set("3", 1);
			map.set("2", 2);
			map.delete("3");
			map.set("1", 3);

			assert.deepEqual(Array.from(map.keys()), ["2", "1"]);
		});

		it.skip("serialize/load", async () => {
			map.set("2", 1);
			map.set("1", 2);
			map.set("4", 5);

			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			const containerRuntime =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services = MockSharedObjectServices.createFromSummary(
				map.getAttachSummary().summary,
			);
			services.deltaConnection = dataStoreRuntime.createDeltaConnection();

			const loadedMap = new SharedMap("loadedMap", dataStoreRuntime, MapFactory.Attributes);
			await loadedMap.load(services);

			assert.deepEqual(Array.from(loadedMap.keys()), ["2", "1", "4"]);
		});
	});

	describe("Connected state", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let map1: SharedMap;
		let map2: SharedMap;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			map1 = createConnectedMap("map1", containerRuntimeFactory);
			map2 = createConnectedMap("map2", containerRuntimeFactory);
		});

		it("Remote messages have no conflict with local pending ops", () => {
			map1.set("1", 1);
			map1.set("2", 2);
			map2.set("3", 1);
			map2.set("4", 2);
			map1.delete("1");

			containerRuntimeFactory.processSomeMessages(2);
			assert.deepEqual(Array.from(map1.keys()), ["2"]);
			assert.deepEqual(Array.from(map2.keys()), ["1", "2", "3", "4"]);

			containerRuntimeFactory.processSomeMessages(2);
			assert.deepEqual(Array.from(map1.keys()), ["2", "3", "4"]);
			assert.deepEqual(Array.from(map2.keys()), ["1", "2", "3", "4"]);

			containerRuntimeFactory.processAllMessages();
			assert.deepEqual(Array.from(map1.keys()), ["2", "3", "4"]);
			assert.deepEqual(Array.from(map2.keys()), ["2", "3", "4"]);
		});

		it("Remote set conflicts with local pending set", () => {
			map1.set("1", 1);
			map1.set("2", 2);
			map2.set("3", 3);
			map2.set("1", 2);

			containerRuntimeFactory.processSomeMessages(2);
			assert.deepEqual(Array.from(map1.keys()), ["1", "2"]);
			assert.deepEqual(Array.from(map1.values()), [1, 2]);
			assert.deepEqual(Array.from(map2.keys()), ["1", "2", "3"]);
			assert.deepEqual(Array.from(map2.values()), [2, 2, 3]);

			containerRuntimeFactory.processSomeMessages(2);
			assert.deepEqual(Array.from(map1.keys()), ["1", "2", "3"]);
			assert.deepEqual(Array.from(map1.values()), [2, 2, 3]);
			assert.deepEqual(Array.from(map2.keys()), ["1", "2", "3"]);
			assert.deepEqual(Array.from(map2.values()), [2, 2, 3]);
		});

		it("Remote sets conflicts with local pending delete", () => {
			map1.set("1", 1);
			map1.set("2", 2);
			map2.set("3", 3);
			map2.set("1", 2);
			map2.delete("1");

			containerRuntimeFactory.processSomeMessages(2);
			assert.deepEqual(Array.from(map1.keys()), ["1", "2"]);
			assert.deepEqual(Array.from(map2.keys()), ["2", "3"]);

			containerRuntimeFactory.processSomeMessages(2);
			assert.deepEqual(Array.from(map1.keys()), ["1", "2", "3"]);
			assert.deepEqual(Array.from(map2.keys()), ["2", "3"]);

			containerRuntimeFactory.processSomeMessages(1);
			assert.deepEqual(Array.from(map1.keys()), ["2", "3"]);
			assert.deepEqual(Array.from(map2.keys()), ["2", "3"]);
		});

		it("Remote set conflicts with local pending clear", () => {
			map1.set("1", 1);
			map1.set("2", 2);
			map2.set("3", 3);
			map2.clear();
			map2.set("1", 4);

			containerRuntimeFactory.processSomeMessages(3);
			assert.deepEqual(Array.from(map1.keys()), ["1", "2", "3"]);
			assert.deepEqual(Array.from(map1.values()), [1, 2, 3]);
			assert.deepEqual(Array.from(map2.keys()), ["1"]);
			assert.deepEqual(Array.from(map2.values()), [4]);

			containerRuntimeFactory.processSomeMessages(1);
			assert.deepEqual(Array.from(map1.keys()), []);
			assert.deepEqual(Array.from(map2.keys()), ["1"]);

			containerRuntimeFactory.processSomeMessages(1);
			assert.deepEqual(Array.from(map1.keys()), ["1"]);
			assert.deepEqual(Array.from(map1.values()), [4]);
			assert.deepEqual(Array.from(map2.keys()), ["1"]);
			assert.deepEqual(Array.from(map2.values()), [4]);
		});
	});

	describe("Reconnection", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let map1: SharedMap;
		let map2: SharedMap;

		beforeEach(async () => {
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

		it("can resend unacked ops on reconnection and affect the order", async () => {
			map1.set("1", 1);
			map1.set("2", 2);
			map2.set("3", 3);
			map2.set("1", 4);

			// Disconnect and reconnect the first client.
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;

			containerRuntimeFactory.processAllMessages();

			assert.deepEqual(Array.from(map1.keys()), ["3", "1", "2"]);
			assert.deepEqual(Array.from(map1.values()), [3, 1, 2]);
			assert.deepEqual(Array.from(map2.keys()), ["3", "1", "2"]);
			assert.deepEqual(Array.from(map2.values()), [3, 1, 2]);
		});

		it("can store ops in disconnected state and resent them on reconnection, then affect the order", async () => {
			// Disconnect the first client.
			containerRuntime1.connected = false;
		});
	});
});
