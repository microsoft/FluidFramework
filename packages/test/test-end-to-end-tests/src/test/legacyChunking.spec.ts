/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// TODO:AB#6558: This should be provided based on the compatibility configuration.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { SharedMap, type ISharedMap } from "@fluidframework/map";
import {
	ITestFluidObject,
	ChannelFactoryRegistry,
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import {
	describeInstallVersions,
	getContainerRuntimeApi,
	getDataRuntimeApi,
} from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";

const versionWithChunking = "0.56.0";

describeInstallVersions(
	{
		requestAbsoluteVersions: [versionWithChunking],
	},
	/* timeoutMs: 3 minutes */ 180000,
)("Legacy chunking", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let oldMap: ISharedMap;
	let newMap: ISharedMap;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});
	afterEach(async () => provider.reset());

	const mapId = "map";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	const setupContainers = async () => {
		const containerOnLatest = await provider.makeTestContainer(testContainerConfig);
		const newDataObject = (await containerOnLatest.getEntryPoint()) as ITestFluidObject;
		newMap = await newDataObject.getSharedObject<ISharedMap>(mapId);

		const oldContainer = await provider.loadTestContainer(testContainerConfig);
		const oldDataObject =
			await getContainerEntryPointBackCompat<ITestFluidObject>(oldContainer);
		oldMap = await oldDataObject.getSharedObject<ISharedMap>(mapId);

		await provider.ensureSynchronized();
	};

	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");

	it("If an old container sends chunked ops, a new container is able to process them successfully", async () => {
		await setupContainers();
		const regularMessageSizeInBytes = 15 * 1024;
		// Ops larger than 16k will end up chunked in older versions of fluid
		const chunkableMessageSizeInBytes = 300 * 1024;
		const regularValue = generateStringOfSize(regularMessageSizeInBytes);
		const chunkableValue = generateStringOfSize(chunkableMessageSizeInBytes);
		oldMap.set("key0", regularValue);
		oldMap.set("key1", chunkableValue);
		oldMap.set("key2", chunkableValue);
		oldMap.set("key3", regularValue);
		oldMap.set("key4", regularValue);

		await provider.ensureSynchronized();
		assert.strictEqual(newMap.get("key0"), regularValue, "Wrong value found in the new map");
		assert.strictEqual(newMap.get("key1"), chunkableValue, "Wrong value found in the new map");
		assert.strictEqual(newMap.get("key2"), chunkableValue, "Wrong value found in the new map");
		assert.strictEqual(newMap.get("key3"), regularValue, "Wrong value found in the new map");
		assert.strictEqual(newMap.get("key4"), regularValue, "Wrong value found in the new map");
	});
});
