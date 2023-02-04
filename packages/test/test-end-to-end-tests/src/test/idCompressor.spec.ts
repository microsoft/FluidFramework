/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";

const mapId = "mapKey";
const testContainerConfig: ITestContainerConfig = {
	registry: [["mapKey", SharedMap.getFactory()]],
	runtimeOptions: {
		enableRuntimeIdCompressor: true,
	},
	fluidDataObjectType: DataObjectFactoryType.Test,
};

describeNoCompat("Runtime IdCompressor", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	let dataObject1: ITestFluidObject;
	let sharedMap1: SharedMap;
	let sharedMap2: SharedMap;
	let sharedMap3: SharedMap;

	beforeEach(async () => {
		const container1 = (await provider.makeTestContainer(testContainerConfig)) as Container;
		dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		sharedMap1 = await dataObject1.getSharedObject<SharedMap>(mapId);

		const container2 = (await provider.loadTestContainer(testContainerConfig)) as Container;
		const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		sharedMap2 = await dataObject2.getSharedObject<SharedMap>(mapId);

		const container3 = (await provider.loadTestContainer(testContainerConfig)) as Container;
		const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");
		sharedMap3 = await dataObject3.getSharedObject<SharedMap>(mapId);

		sharedMap1.set("testKey1", "testValue");

		await provider.ensureSynchronized();
	});

	function expectAllValues(msg, key, value1, value2, value3) {
		const user1Value = sharedMap1.get(key);
		assert.equal(user1Value, value1, `Incorrect value for ${key} in container 1 ${msg}`);
		const user2Value = sharedMap2.get(key);
		assert.equal(user2Value, value2, `Incorrect value for ${key} in container 2 ${msg}`);
		const user3Value = sharedMap3.get(key);
		assert.equal(user3Value, value3, `Incorrect value for ${key} in container 3 ${msg}`);
	}

	function expectAllBeforeValues(key, value1, value2, value3) {
		expectAllValues("before process", key, value1, value2, value3);
	}

	function expectAllAfterValues(key, value) {
		expectAllValues("after process", key, value, value, value);
	}

	function expectAllSize(size) {
		const keys1 = Array.from(sharedMap1.keys());
		assert.equal(keys1.length, size, "Incorrect number of Keys in container 1");
		const keys2 = Array.from(sharedMap2.keys());
		assert.equal(keys2.length, size, "Incorrect number of Keys in container 2");
		const keys3 = Array.from(sharedMap3.keys());
		assert.equal(keys3.length, size, "Incorrect number of Keys in container 3");

		assert.equal(sharedMap1.size, size, "Incorrect map size in container 1");
		assert.equal(sharedMap2.size, size, "Incorrect map size in container 2");
		assert.equal(sharedMap3.size, size, "Incorrect map size in container 3");
	}

	it.only("should set key value in three containers correctly", async () => {
		expectAllAfterValues("testKey1", "testValue");

		console.log(sharedMap1.idCompressor?.generateCompressedId());
		sharedMap1.set("testKey1", undefined);
		await provider.ensureSynchronized();

		expectAllAfterValues("testKey1", undefined);

		console.log(sharedMap2.idCompressor?.generateCompressedId());
		sharedMap2.set("testKey2", undefined);
		await provider.ensureSynchronized();

		expectAllAfterValues("testKey1", undefined);
		expectAllAfterValues("testKey2", undefined);

		console.log(sharedMap1.idCompressor?.generateCompressedId());
		sharedMap1.set("testKey1", "testValue");
		await provider.ensureSynchronized();
		expectAllAfterValues("testKey1", "testValue");

		console.log(sharedMap2.idCompressor?.generateCompressedId());
		sharedMap2.set("testKey2", "testValue");
		await provider.ensureSynchronized();
		expectAllAfterValues("testKey2", "testValue");
	});
});
