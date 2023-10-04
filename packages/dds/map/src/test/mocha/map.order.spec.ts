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
import { ISummaryBlob } from "@fluidframework/protocol-definitions";
import { MapFactory, SharedMap } from "../../map";
import {
	IMapClearOperation,
	IMapDeleteOperation,
	IMapSetOperation,
} from "../../internalInterfaces";
import { ISharedMap } from "../../interfaces";
import { TestSharedMap, createConnectedMap, createLocalMap } from "./mapUtils";

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

	describe("Serialization/Load", () => {
		let map1: ISharedMap;

		it("can be compatible with the old summary without index field", async () => {
			const content = JSON.stringify({
				blobs: [],
				content: {
					2: {
						type: "Plain",
						value: 2,
					},
					1: {
						type: "Plain",
						value: 1,
					},
					3: {
						type: "Plain",
						value: 3,
					},
				},
			});

			const services = new MockSharedObjectServices({ header: content });
			const factory = new MapFactory();
			map1 = await factory.load(
				new MockFluidDataStoreRuntime(),
				"mapId",
				services,
				factory.attributes,
			);
			// The data can be maintained after loading, but the order can not be guaranteed
			assert.equal(map1.get("1"), 1);
			assert.equal(map1.get("2"), 2);
			assert.equal(map1.get("3"), 3);

			assert.deepEqual(Array.from(map1.keys()), ["1", "2", "3"]);
		});

		it("can maintain the expected order given the index", async () => {
			const content = JSON.stringify({
				blobs: [],
				content: {
					2: {
						type: "Plain",
						value: 2,
						index: 0,
					},
					1: {
						type: "Plain",
						value: 1,
						index: 1,
					},
					3: {
						type: "Plain",
						value: 3,
						index: 2,
					},
				},
			});

			const services = new MockSharedObjectServices({ header: content });
			const factory = new MapFactory();
			map1 = await factory.load(
				new MockFluidDataStoreRuntime(),
				"mapId",
				services,
				factory.attributes,
			);
			assert.equal(map1.get("1"), 1);
			assert.equal(map1.get("2"), 2);
			assert.equal(map1.get("3"), 3);

			assert.deepEqual(Array.from(map1.keys()), ["2", "1", "3"]);
		});

		it("serialize the contents, load it into another map and maintain the order", async () => {
			map1 = createLocalMap("map1");
			map1.set("2", 1);
			map1.set("1", 2);
			map1.set("4", 5);

			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			const containerRuntime =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services = MockSharedObjectServices.createFromSummary(
				map1.getAttachSummary().summary,
			);
			services.deltaConnection = dataStoreRuntime.createDeltaConnection();

			const map2 = new SharedMap("map2", dataStoreRuntime, MapFactory.Attributes);
			map2.set("1", 3);
			map2.set("6", 6);
			await map2.load(services);

			assert.deepEqual(Array.from(map2.keys()), ["2", "1", "4", "6"]);
		});

		it("serialize big maps with multiple blobs and maintain the order", async () => {
			map1 = createLocalMap("map1");
			map1.set("2", 1);

			// 40K char string
			let longString = "01234567890";
			for (let i = 0; i < 12; i++) {
				longString = longString + longString;
			}
			map1.set("1", longString);
			map1.set("3", 3);

			const summaryTree = map1.getAttachSummary().summary;
			assert.strictEqual(
				Object.keys(summaryTree.tree).length,
				2,
				"There should be 2 entries in the summary tree",
			);
			const expectedContent1 = JSON.stringify({
				blobs: ["blob0"],
				content: {
					2: {
						type: "Plain",
						value: 1,
						index: 0,
					},
					3: {
						type: "Plain",
						value: 3,
						index: 2,
					},
				},
			});
			const expectedContent2 = JSON.stringify({
				1: {
					type: "Plain",
					value: longString,
					index: 1,
				},
			});

			const header = summaryTree.tree.header as ISummaryBlob;
			const blob0 = summaryTree.tree.blob0 as ISummaryBlob;
			assert.strictEqual(
				header?.content,
				expectedContent1,
				"header content is not as expected",
			);
			assert.strictEqual(
				blob0?.content,
				expectedContent2,
				"blob0 content is not as expected",
			);

			const services = new MockSharedObjectServices({
				header: header.content,
				blob0: blob0.content,
			});
			const factory = new MapFactory();
			const map2 = await factory.load(
				new MockFluidDataStoreRuntime(),
				"mapId",
				services,
				factory.attributes,
			);

			assert.deepEqual(Array.from(map2.keys()), ["2", "1", "3"]);
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
	});

	describe("Op processing", () => {
		let map: TestSharedMap;

		beforeEach(async () => {
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			map = new TestSharedMap("testMap1", dataStoreRuntime, MapFactory.Attributes);
		});

		it("metadata op", async () => {
			const value1 = { type: "Plain", value: 1 };
			const value2 = { type: "Plain", value: 2 };
			const value3 = { type: "Plain", value: 3 };

			const op1: IMapSetOperation = { type: "set", key: "1", value: value1 };
			const op2: IMapSetOperation = { type: "set", key: "2", value: value2 };
			const op3: IMapSetOperation = { type: "set", key: "3", value: value3 };

			map.testApplyStashedOp(op2);
			map.testApplyStashedOp(op1);
			map.testApplyStashedOp(op3);
			assert.deepEqual(Array.from(map.keys()), ["2", "1", "3"]);

			const op4: IMapDeleteOperation = { type: "delete", key: "1" };
			map.testApplyStashedOp(op4);
			assert.deepEqual(Array.from(map.keys()), ["2", "3"]);

			const op5: IMapClearOperation = { type: "clear" };
			map.testApplyStashedOp(op5);
			assert.deepEqual(Array.from(map.keys()), []);
		});
	});
});
