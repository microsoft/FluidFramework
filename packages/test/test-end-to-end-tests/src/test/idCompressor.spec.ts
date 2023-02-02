/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

const testContainerConfig: ITestContainerConfig = {
	registry: [["mapKey", SharedMap.getFactory()]],
	runtimeOptions: {
		enableRuntimeIdCompressor: true,
	},
	fluidDataObjectType: DataObjectFactoryType.Test,
};

describeNoCompat("Runtime IdCompressor", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let container: Container;
	let dataObject: ITestFluidObject;
	let map: SharedMap;
	let map2: SharedMap;

	beforeEach(async () => {
		provider = getTestObjectProvider();

		container = (await provider.makeTestContainer(testContainerConfig)) as Container;
		dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
		map = await dataObject.getSharedObject<SharedMap>("mapKey");

		const secondContainer = await provider.loadTestContainer(testContainerConfig);
		const secondDataObject = await requestFluidObject<ITestFluidObject>(
			secondContainer,
			"default",
		);
		map2 = await secondDataObject.getSharedObject<SharedMap>("mapKey");
	});

	afterEach(() => {
		provider.reset();
	});

	it.only("Can generate a compressed Id", async () => {
		const id = map.idCompressor?.generateCompressedId();
		map.set("key", "value");
		await provider.ensureSynchronized();
		console.log(id);
	});
});
