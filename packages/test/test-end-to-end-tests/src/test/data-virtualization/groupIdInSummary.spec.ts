/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
	type ContainerRuntime,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import {
	createSummarizerFromFactory,
	summarizeNow,
	type ITestObjectProvider,
	createTestConfigProvider,
} from "@fluidframework/test-utils";
import { SummaryType } from "@fluidframework/protocol-definitions";
import { LoaderHeader } from "@fluidframework/container-definitions";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

// A Test Data Object that exposes some basic functionality.
class TestDataObject extends DataObject {
	public get _root() {
		return this.root;
	}

	public get containerRuntime() {
		return this.context.containerRuntime as ContainerRuntime;
	}

	public get loadingGroupId() {
		return this.context.loadingGroupId;
	}
}

describeCompat("Create data store with group id", "NoCompat", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};

	const testDataObjectType = "TestDataObject";
	const dataObjectFactory = new DataObjectFactory(testDataObjectType, TestDataObject, [], {});

	// The 1st runtime factory, V1 of the code
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
	});

	const loadingGroupId = "loadingGroupId";
	it("Can create loadingGroupId", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const mainObject = (await container.getEntryPoint()) as TestDataObject;
		const containerRuntime = mainObject.containerRuntime;

		const dataStore = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);
		const dataStore2 = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);
		const dataObjectA = (await dataStore.entryPoint.get()) as TestDataObject;
		const dataObjectB = (await dataStore2.entryPoint.get()) as TestDataObject;
		mainObject._root.set("dataObjectA", dataObjectA.handle);
		mainObject._root.set("dataObjectB", dataObjectB.handle);

		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactory,
		);
		await provider.ensureSynchronized();
		const { summaryVersion, summaryTree } = await summarizeNow(summarizer);
		const channelsTree = summaryTree.tree[".channels"];
		assert(channelsTree.type === SummaryType.Tree, "channels should be a tree");
		const dataObjectTree = channelsTree.tree[dataObjectA.id];
		assert(dataObjectTree !== undefined, "dataObjectTree should exist");
		assert(dataObjectTree.type === SummaryType.Tree, "dataObjectTree should be a tree");
		assert(dataObjectTree.groupId === loadingGroupId, "GroupId should be on the summary tree");

		// TODO: Enable this portion in tinylicious
		if (provider.driver.type === "local") {
			const container2 = await provider.loadContainer(runtimeFactory, undefined, {
				[LoaderHeader.version]: summaryVersion,
			});

			const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
			const handleA2 = mainObject2._root.get("dataObjectA");
			const handleB2 = mainObject2._root.get("dataObjectB");
			assert(handleA2 !== undefined, "handleA2 should not be undefined");
			assert(handleB2 !== undefined, "handleB2 should not be undefined");
			const dataObjectA2 = (await handleA2.get()) as TestDataObject;
			const dataObjectB2 = (await handleB2.get()) as TestDataObject;
			assert.equal(
				dataObjectA2.loadingGroupId,
				loadingGroupId,
				"dataObjectA groupId should be set",
			);
			assert.equal(
				dataObjectB2.loadingGroupId,
				loadingGroupId,
				"dataObjectB groupId should be set",
			);
		}
	});

	// TODO: enable this test, because it fails for local server.
	it.skip("Can create loadingGroupId via detached flow", async () => {
		const container = await provider.createDetachedContainer(runtimeFactory);
		const mainObject = (await container.getEntryPoint()) as TestDataObject;
		const containerRuntime = mainObject.containerRuntime;

		const dataStore = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);
		const dataStore2 = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);
		const dataObject = (await dataStore.entryPoint.get()) as TestDataObject;
		const dataObject2 = (await dataStore2.entryPoint.get()) as TestDataObject;
		mainObject._root.set("dataObject", dataObject.handle);
		mainObject._root.set("dataObject2", dataObject2.handle);
		mainObject._root.delete("dataObject2");

		await provider.attachDetachedContainer(container);
		// TODO: Enable this portion in tinylicious
		if (provider.driver.type === "local") {
			const container2 = await provider.loadContainer(runtimeFactory);
			await provider.ensureSynchronized();

			const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
			const handleA2 = mainObject2._root.get("dataObjectA");
			const handleB2 = mainObject2._root.get("dataObjectB");
			assert(handleA2 !== undefined, "handleA2 should not be undefined");
			assert(handleB2 !== undefined, "handleB2 should not be undefined");
			const dataObjectA2 = (await handleA2.get()) as TestDataObject;
			const dataObjectB2 = (await handleB2.get()) as TestDataObject;
			assert.equal(
				dataObjectA2.loadingGroupId,
				loadingGroupId,
				"dataObjectA groupId should be set",
			);
			assert.equal(
				dataObjectB2.loadingGroupId,
				loadingGroupId,
				"dataObjectB groupId should be set",
			);
		}
	});

	it("Excludes dataStores with loadingGroupId from summary", async () => {
		if (provider.driver.type !== "local") {
			return;
		}
		// Load basic container stuff
		const container = await provider.createContainer(runtimeFactory);
		const mainObject = (await container.getEntryPoint()) as TestDataObject;
		const containerRuntime = mainObject.containerRuntime;

		// Create data stores with loadingGroupIds
		const dataStoreA = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);
		const dataStoreB = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);

		// Attach the data stores
		const dataObjectA = (await dataStoreA.entryPoint.get()) as TestDataObject;
		const dataObjectB = (await dataStoreB.entryPoint.get()) as TestDataObject;
		mainObject._root.set("dataObjectA", dataObjectA.handle);
		mainObject._root.set("dataObjectB", dataObjectB.handle);
		dataObjectA._root.set("A", "A");
		dataObjectB._root.set("B", "B");

		// Summarize
		await provider.ensureSynchronized();
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactory,
		);
		const { summaryVersion } = await summarizeNow(summarizer);

		// Load from the summary
		const configProvider = createTestConfigProvider();
		configProvider.set("Fluid.Container.UseLoadingGroupIdForSnapshotFetch", true);
		const container3 = await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
			{
				[LoaderHeader.version]: summaryVersion,
			},
		);

		// Regular load path should work
		const mainObject3 = (await container3.getEntryPoint()) as TestDataObject;
		// Try to load the data stores with groupIds
		const handleA3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		const handleB3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
		assert(handleA3 !== undefined, "handleA3 should not be undefined");
		assert(handleB3 !== undefined, "handleB3 should not be undefined");

		const dataObjectA3 = await handleA3.get();
		const dataObjectB3 = await handleB3.get();
		assert.equal(dataObjectA3._root.get("A"), "A", "A should be set");
		assert.equal(dataObjectB3._root.get("B"), "B", "B should be set");

		// Testing the get snapshot call
		const runtime3 = mainObject.containerRuntime;
		assert(runtime3.storage.getSnapshot !== undefined, "getSnapshot should be defined");
		const snapshot = await runtime3.storage.getSnapshot();
		const channelsTree = snapshot.snapshotTree.trees[".channels"];
		const mainObjectTree = channelsTree.trees[mainObject.id];
		const dataObjectATree = channelsTree.trees[dataObjectA.id];
		const dataObjectBTree = channelsTree.trees[dataObjectB.id];

		assert(mainObjectTree.omitted === undefined, "mainObject should not be omitted");
		assert(mainObjectTree.groupId === undefined, "mainObject should not have a groupId");
		assert(Object.entries(mainObjectTree.trees).length > 0, "mainObject missing trees");
		assert(Object.entries(mainObjectTree.blobs).length > 0, "mainObject missing blobs");

		assert(dataObjectATree.omitted, "dataObjectA should be omitted");
		assert(dataObjectATree.groupId === loadingGroupId, "dataObjectA should have a groupId");
		assert(Object.entries(dataObjectATree.trees).length === 0, "dataObjectA has trees!");
		assert(Object.entries(dataObjectATree.blobs).length === 0, "dataObjectA has blobs!");

		assert(dataObjectBTree.omitted, "dataObjectB should be omitted");
		assert(dataObjectBTree.groupId === loadingGroupId, "dataObjectB should have a groupId");
		assert(Object.entries(dataObjectBTree.trees).length === 0, "dataObjectB has trees!");
		assert(Object.entries(dataObjectBTree.blobs).length === 0, "dataObjectB has blobs!");

		// Testing the get snapshot call with loadingGroupId
		const loadingGroupIdSnapshot = await runtime3.storage.getSnapshot({
			loadingGroupIds: [loadingGroupId],
			versionId: summaryVersion,
		});
		const channelsTree2 = loadingGroupIdSnapshot.snapshotTree.trees[".channels"];
		const mainObjectTree2 = channelsTree2.trees[mainObject.id];
		const dataObjectATree2 = channelsTree2.trees[dataObjectA.id];
		const dataObjectBTree2 = channelsTree2.trees[dataObjectB.id];

		assert(mainObjectTree2.omitted, "mainObject should be omitted");
		assert(mainObjectTree2.groupId === undefined, "mainObject should not have a groupId");
		assert(Object.entries(mainObjectTree2.trees).length === 0, "mainObject has trees!");
		assert(Object.entries(mainObjectTree2.blobs).length === 0, "mainObject has blobs!");

		assert(dataObjectATree2.omitted === undefined, "dataObjectA should not be omitted");
		assert(dataObjectATree2.groupId === loadingGroupId, "dataObjectA should have a groupId");
		assert(Object.entries(dataObjectATree2.trees).length > 0, "dataObjectA missing trees");
		assert(Object.entries(dataObjectATree2.blobs).length > 0, "dataObjectA missing blobs");

		assert(dataObjectBTree2.omitted === undefined, "dataObjectB should not be omitted");
		assert(dataObjectBTree2.groupId === loadingGroupId, "dataObjectB should have a groupId");
		assert(Object.entries(dataObjectBTree2.trees).length > 0, "dataObjectB missing trees");
		assert(Object.entries(dataObjectBTree2.blobs).length > 0, "dataObjectB missing blobs");
	});
});
