/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISharedMap } from "@fluidframework/map";
import type { IConsensusRegisterCollection } from "@fluidframework/register-collection";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ITestFluidObject,
	ChannelFactoryRegistry,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";

const mapId = "mapKey";

describeCompat("ConsensusRegisterCollection", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedMap, ConsensusRegisterCollection } = apis.dds;
	const { ReadPolicy } = apis.dataRuntime.packages.registerCollection;

	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[undefined, ConsensusRegisterCollection.getFactory()],
	];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});
	let dataStore1: ITestFluidObject;
	let sharedMap1: ISharedMap;
	let sharedMap2: ISharedMap;
	let sharedMap3: ISharedMap;

	beforeEach("createSharedMaps", async () => {
		// Create a Container for the first client.
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataStore1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		sharedMap1 = await dataStore1.getSharedObject<ISharedMap>(mapId);

		// Load the Container that was created by the first client.
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		sharedMap2 = await dataStore2.getSharedObject<ISharedMap>(mapId);

		// Load the Container that was created by the first client.
		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataStore3 = await getContainerEntryPointBackCompat<ITestFluidObject>(container3);
		sharedMap3 = await dataStore3.getSharedObject<ISharedMap>(mapId);
	});

	it("Basic functionality", async () => {
		const collection1 = ConsensusRegisterCollection.create(dataStore1.runtime);
		sharedMap1.set("collection", collection1.handle);
		await collection1.write("key1", "value1");
		await collection1.write("key2", "value2");

		await provider.ensureSynchronized();

		const collection2Handle =
			sharedMap2.get<IFluidHandle<IConsensusRegisterCollection>>("collection");
		const collection3Handle =
			sharedMap3.get<IFluidHandle<IConsensusRegisterCollection>>("collection");
		assert(collection2Handle);
		assert(collection3Handle);
		const collection2 = await collection2Handle.get();
		const collection3 = await collection3Handle.get();

		await provider.ensureSynchronized();

		assert.strictEqual(
			collection1.read("key1"),
			"value1",
			"Collection not initialize in document 1",
		);
		assert.strictEqual(
			collection2.read("key1"),
			"value1",
			"Collection not initialize in document 2",
		);
		assert.strictEqual(
			collection3.read("key1"),
			"value1",
			"Collection not initialize in document 3",
		);
		assert.strictEqual(
			collection1.read("key2"),
			"value2",
			"Collection not initialize in document 1",
		);
		assert.strictEqual(
			collection2.read("key2"),
			"value2",
			"Collection not initialize in document 2",
		);
		assert.strictEqual(
			collection3.read("key2"),
			"value2",
			"Collection not initialize in document 3",
		);

		assert.strictEqual(
			collection1.read("key3"),
			undefined,
			"Reading non existent key should be undefined",
		);
		assert.strictEqual(
			collection2.read("key3"),
			undefined,
			"Reading non existent key should be undefined",
		);
		assert.strictEqual(
			collection3.read("key3"),
			undefined,
			"Reading non existent key should be undefined",
		);
	});

	it("Should store all concurrent writings on a key in sequenced order", async () => {
		const collection1 = ConsensusRegisterCollection.create(dataStore1.runtime);
		sharedMap1.set("collection", collection1.handle);
		await provider.ensureSynchronized();

		const collection2Handle =
			sharedMap2.get<IFluidHandle<IConsensusRegisterCollection>>("collection");
		const collection3Handle =
			sharedMap3.get<IFluidHandle<IConsensusRegisterCollection>>("collection");
		assert(collection2Handle);
		assert(collection3Handle);
		const collection2 = await collection2Handle.get();
		const collection3 = await collection3Handle.get();

		// Force processOutgoing for the following write to make sure the op is sequence in the right order
		const write1P = collection1.write("key1", "value1");
		await provider.opProcessingController.processOutgoing();

		const write2P = collection2.write("key1", "value2");
		await provider.opProcessingController.processOutgoing();

		const write3P = collection3.write("key1", "value3");
		await provider.opProcessingController.processOutgoing();

		// Resume normal processing now that we have done ordering our action
		provider.opProcessingController.resumeProcessing();

		await Promise.all([write1P, write2P, write3P]);
		await provider.ensureSynchronized();

		const versions = collection1.readVersions("key1");
		assert(versions);
		assert.strictEqual(versions.length, 3, "Concurrent updates were not preserved");
		assert.strictEqual(versions[0], "value1", "Incorrect update sequence");
		assert.strictEqual(versions[1], "value2", "Incorrect update sequence");
		assert.strictEqual(versions[2], "value3", "Incorrect update sequence");

		assert.strictEqual(collection1.read("key1"), "value1", "Default read policy is atomic");
		assert.strictEqual(
			collection1.read("key1", ReadPolicy.Atomic),
			"value1",
			"Atomic policy should work",
		);
		assert.strictEqual(
			collection1.read("key1", ReadPolicy.LWW),
			"value3",
			"LWW policy should work",
		);
	});

	it("Happened after updates should overwrite previous versions", async () => {
		const collection1 = ConsensusRegisterCollection.create(dataStore1.runtime);
		sharedMap1.set("collection", collection1.handle);
		await provider.ensureSynchronized();

		const collection2Handle =
			sharedMap2.get<IFluidHandle<IConsensusRegisterCollection>>("collection");
		const collection3Handle =
			sharedMap3.get<IFluidHandle<IConsensusRegisterCollection>>("collection");
		assert(collection2Handle);
		assert(collection3Handle);
		const collection2 = await collection2Handle.get();
		const collection3 = await collection3Handle.get();

		const write1P = collection1.write("key1", "value1");
		const write2P = collection2.write("key1", "value2");
		const write3P = collection3.write("key1", "value3");
		await Promise.all([write1P, write2P, write3P]);
		await provider.ensureSynchronized();

		const versions = collection1.readVersions("key1");
		assert(versions);
		assert.strictEqual(versions.length, 3, "Concurrent updates were not preserved");

		await collection3.write("key1", "value4");
		await provider.ensureSynchronized();
		const versions2 = collection1.readVersions("key1");
		assert(versions2);
		assert.strictEqual(versions2.length, 1, "Happened after value did not overwrite");
		assert.strictEqual(versions2[0], "value4", "Happened after value did not overwrite");

		await collection2.write("key1", "value5");
		await provider.ensureSynchronized();
		const versions3 = collection1.readVersions("key1");
		assert(versions3);
		assert.strictEqual(versions3.length, 1, "Happened after value did not overwrite");
		assert.strictEqual(versions3[0], "value5", "Happened after value did not overwrite");

		await collection1.write("key1", "value6");
		await provider.ensureSynchronized();
		const versions4 = collection1.readVersions("key1");
		assert(versions4);
		assert.strictEqual(versions4.length, 1, "Happened after value did not overwrite");
		assert.strictEqual(versions4[0], "value6", "Happened after value did not overwrite");

		// Force processOutgoing for the following write to make sure the op is sequence in the right order
		const write7P = collection1.write("key1", "value7");
		await provider.opProcessingController.processOutgoing();

		const write8P = collection2.write("key1", "value8");
		await provider.opProcessingController.processOutgoing();

		const write9P = collection3.write("key1", "value9");
		await provider.opProcessingController.processOutgoing();

		// Resume normal processing now that we have done ordering our action
		provider.opProcessingController.resumeProcessing();

		await Promise.all([write7P, write8P, write9P]);
		await provider.ensureSynchronized();
		const versions5 = collection3.readVersions("key1");
		assert(versions5);
		assert.strictEqual(
			versions5.length,
			3,
			"Concurrent happened after updates should overwrite and preserve",
		);
		assert.strictEqual(versions5[0], "value7", "Incorrect update sequence");
		assert.strictEqual(versions5[1], "value8", "Incorrect update sequence");
		assert.strictEqual(versions5[2], "value9", "Incorrect update sequence");

		await collection2.write("key1", "value10");
		const versions6 = collection2.readVersions("key1");
		assert(versions6);
		assert.strictEqual(versions6.length, 1, "Happened after value did not overwrite");
		assert.strictEqual(versions6[0], "value10", "Happened after value did not overwrite");
	});

	it("Can store handles", async () => {
		// Set up the collection with two handles and add it to the map so other containers can find it
		const collection1 = ConsensusRegisterCollection.create(dataStore1.runtime);
		sharedMap1.set("test", "sampleValue");
		sharedMap1.set("collection", collection1.handle);
		await collection1.write("handleA", sharedMap1.handle);
		await collection1.write("handleB", sharedMap1.handle);

		await provider.ensureSynchronized();

		// Pull the collection off of the 2nd container
		const collection2Handle =
			sharedMap2.get<IFluidHandle<IConsensusRegisterCollection>>("collection");
		assert(collection2Handle);
		const collection2 = await collection2Handle.get();

		// acquire one handle in each container
		const sharedMap1HandleB = collection1.read("handleB") as IFluidHandle<ISharedMap>;
		const sharedMap1Prime = await sharedMap1HandleB.get();
		const sharedMap2HandleA = collection2.read("handleA") as IFluidHandle<ISharedMap>;
		const sharedMap2Prime = await sharedMap2HandleA.get();

		assert.equal(sharedMap1Prime.get("test"), "sampleValue");
		assert.equal(sharedMap2Prime.get("test"), "sampleValue");
	});
});

describeCompat(
	"ConsensusRegisterCollection grouped batching",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedMap, ConsensusRegisterCollection } = apis.dds;
		const registry: ChannelFactoryRegistry = [
			[mapId, SharedMap.getFactory()],
			[undefined, ConsensusRegisterCollection.getFactory()],
		];
		const groupedBatchingContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			runtimeOptions: { enableGroupedBatching: true },
		};

		let provider: ITestObjectProvider;
		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
		});

		it("grouped batching doesn't hit 0x071", async () => {
			const container = await provider.makeTestContainer(groupedBatchingContainerConfig);
			const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
			const sharedMap = await dataObject.getSharedObject<ISharedMap>(mapId);

			const collection = ConsensusRegisterCollection.create(dataObject.runtime);

			sharedMap.set("collection", collection.handle);
			const write1P = collection.write("key1", "value1");
			const write2P = collection.write("key1", "value2");
			await Promise.all([write1P, write2P]);
			await provider.ensureSynchronized();
		});
	},
);
