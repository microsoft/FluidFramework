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

	it.only("produces Id spaces correctly", async () => {
		assert(sharedMap1.idCompressor !== undefined);
		assert(sharedMap2.idCompressor !== undefined);
		assert(sharedMap3.idCompressor !== undefined);

		const firstId = sharedMap1.idCompressor.generateCompressedId();
		const secondId = sharedMap2.idCompressor.generateCompressedId();
		const thirdId = sharedMap2.idCompressor.generateCompressedId();
		const decompressedIds: string[] = [];

		const firstDecompressedId = sharedMap1.idCompressor.decompress(firstId);
		decompressedIds.push(firstDecompressedId);
		sharedMap1.set(firstDecompressedId, "value1");

		[secondId, thirdId].forEach((id, index) => {
			assert(sharedMap2.idCompressor !== undefined);
			const decompressedId = sharedMap2.idCompressor.decompress(id);
			decompressedIds.push(decompressedId);
			sharedMap2.set(decompressedId, `value${index + 2}`);
		});

		// should be negative
		assert(sharedMap1.idCompressor.normalizeToOpSpace(firstId) < 0);
		assert(sharedMap2.idCompressor.normalizeToOpSpace(secondId) < 0);
		assert(sharedMap2.idCompressor.normalizeToOpSpace(thirdId) < 0);

		await provider.ensureSynchronized();

		assert(sharedMap1.idCompressor.normalizeToOpSpace(firstId) > 0);
		assert(sharedMap2.idCompressor.normalizeToOpSpace(secondId) > 0);
		assert(sharedMap2.idCompressor.normalizeToOpSpace(thirdId) > 0);

		decompressedIds.forEach((id, index) => {
			assert.equal(sharedMap1.get(id), `value${index + 1}`);
			assert.equal(sharedMap2.get(id), `value${index + 1}`);
		});
	});
});
