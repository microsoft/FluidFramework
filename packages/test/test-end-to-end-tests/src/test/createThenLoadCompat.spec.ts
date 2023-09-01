// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import { strict as assert } from "assert";
// import { SharedMap } from "@fluidframework/map";
// import { requestFluidObject } from "@fluidframework/runtime-utils";
// import {
// 	ITestFluidObject,
// 	ChannelFactoryRegistry,
// 	ITestObjectProvider,
// 	ITestContainerConfig,
// 	DataObjectFactoryType,
// } from "@fluidframework/test-utils";
// import {
// 	describeInstallVersions,
// 	getContainerRuntimeApi,
// 	getDataRuntimeApi,
// } from "@fluid-internal/test-version-utils";
// import { IContainer } from "@fluidframework/container-definitions";
// import { FlushMode, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
// import { IRequest } from "@fluidframework/core-interfaces";

// const ltsVersion = "1.3.7";
// const mainVersion = "2.0.0-internal.6.2.0";

// describeInstallVersions(
// 	{
// 		requestAbsoluteVersions: [ltsVersion, mainVersion],
// 	},
// 	/* timeoutMs: 3 minutes */ 180000,
// )("createThenLoadCompat", (getTestObjectProvider) => {
// 	let provider: ITestObjectProvider;
// 	let oldMap: SharedMap;
// 	let newMap: SharedMap;
// 	beforeEach(() => {
// 		provider = getTestObjectProvider();
// 	});
// 	afterEach(async () => provider.reset());

//   it("test 1", async () => {
//     const c1 = await provider.makeTestContainer();
//     const m1 = c1.get

//   });

// 	// const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
// 	// 	runtime.IFluidHandleContext.resolveHandle(request);
// 	// const mapId = "map";
// 	// const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
// 	// const testContainerConfig: ITestContainerConfig = {
// 	// 	fluidDataObjectType: DataObjectFactoryType.Test,
// 	// 	registry,
// 	// };

// 	/**
// 	 * Create a container with old version of container runtime and data store runtime.
// 	 */
// 	// const createOldContainer = async (): Promise<IContainer> => {
// 	// 	const oldDataRuntimeApi = getDataRuntimeApi(ltsVersion);
// 	// 	const oldDataObjectFactory = new oldDataRuntimeApi.TestFluidObjectFactory(
// 	// 		[
// 	// 			["sharedString", oldDataRuntimeApi.dds.SharedString.getFactory()],
// 	// 			["sharedDirectory", oldDataRuntimeApi.dds.SharedDirectory.getFactory()],
// 	// 			[undefined, oldDataRuntimeApi.dds.SharedCounter.getFactory()],
// 	// 		],
// 	// 		"old",
// 	// 	);

// 	// 	const ContainerRuntimeFactoryWithDefaultDataStore_Old =
// 	// 		getContainerRuntimeApi(ltsVersion).ContainerRuntimeFactoryWithDefaultDataStore;
// 	// 	const oldRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore_Old(
// 	// 		oldDataObjectFactory,
// 	// 		[[oldDataObjectFactory.type, Promise.resolve(oldDataObjectFactory)]],
// 	// 		undefined,
// 	// 		[innerRequestHandler],
// 	// 		{
// 	// 			// Chunking did not work with FlushMode.TurnBased,
// 	// 			// as it was breaking batching semantics. So we need
// 	// 			// to force the container to flush the ops as soon as
// 	// 			// they are produced.
// 	// 			flushMode: FlushMode.Immediate,
// 	// 			gcOptions: {
// 	// 				gcAllowed: true,
// 	// 			},
// 	// 		},
// 	// 	);

// 	// 	return provider.createContainer(oldRuntimeFactory);
// 	// };

// 	const setupContainers = async () => {
// 		const oldContainer = await createOldContainer();
// 		const oldDataObject = await requestFluidObject<ITestFluidObject>(oldContainer, "default");
// 		oldMap = await oldDataObject.getSharedObject<SharedMap>(mapId);

// 		const containerOnLatest = await provider.loadTestContainer(testContainerConfig);
// 		const newDataObject = await requestFluidObject<ITestFluidObject>(
// 			containerOnLatest,
// 			"default",
// 		);
// 		newMap = await newDataObject.getSharedObject<SharedMap>(mapId);

// 		await provider.ensureSynchronized();
// 	};

// 	const generateStringOfSize = (sizeInBytes: number): string =>
// 		new Array(sizeInBytes + 1).join("0");

// 	it("If an old container sends chunked ops, a new container is able to process them successfully", async () => {
// 		await setupContainers();
// 		const regularMessageSizeInBytes = 15 * 1024;
// 		// Ops larger than 16k will end up chunked in older versions of fluid
// 		const chunkableMessageSizeInBytes = 300 * 1024;
// 		const regularValue = generateStringOfSize(regularMessageSizeInBytes);
// 		const chunkableValue = generateStringOfSize(chunkableMessageSizeInBytes);
// 		oldMap.set("key0", regularValue);
// 		oldMap.set("key1", chunkableValue);
// 		oldMap.set("key2", chunkableValue);
// 		oldMap.set("key3", regularValue);
// 		oldMap.set("key4", regularValue);

// 		await provider.ensureSynchronized();
// 		assert.strictEqual(newMap.get("key0"), regularValue, "Wrong value found in the new map");
// 		assert.strictEqual(newMap.get("key1"), chunkableValue, "Wrong value found in the new map");
// 		assert.strictEqual(newMap.get("key2"), chunkableValue, "Wrong value found in the new map");
// 		assert.strictEqual(newMap.get("key3"), regularValue, "Wrong value found in the new map");
// 		assert.strictEqual(newMap.get("key4"), regularValue, "Wrong value found in the new map");
// 	});
// });
