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
import { SummaryType, type ISnapshotTree } from "@fluidframework/protocol-definitions";
import { LoaderHeader } from "@fluidframework/container-definitions";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISnapshot } from "@fluidframework/driver-definitions";
import { Deferred } from "@fluidframework/core-utils";

import type { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";

const interceptResult = <T>(
	parent: any,
	fn: (...args: any[]) => Promise<T>,
	intercept: (result: T) => void,
) => {
	const interceptFn = async (...args: any[]) => {
		const val = await fn.apply(parent, args);
		intercept(val);
		return val as T;
	};
	parent[fn.name] = interceptFn;
	interceptFn.bind(parent);
	return fn;
};

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

	const assertOmittedGroupIdTree = (snapshotTree: ISnapshotTree, message: string) => {
		assert(snapshotTree.omitted, message);
		assert(snapshotTree.groupId === loadingGroupId, message);
		assert(Object.entries(snapshotTree.trees).length === 0, message);
		assert(Object.entries(snapshotTree.blobs).length === 0, message);
	};

	const assertPopulatedRegularTree = (snapshotTree: ISnapshotTree, message: string) => {
		assert(snapshotTree.omitted === undefined, message);
		assert(snapshotTree.groupId === undefined, message);
		assert(Object.entries(snapshotTree.trees).length > 0, message);
		assert(Object.entries(snapshotTree.blobs).length > 0, message);
	};

	const assertOmittedRegularTree = (snapshotTree: ISnapshotTree, message: string) => {
		assert(snapshotTree.omitted, message);
		assert(snapshotTree.groupId === undefined, message);
		assert(Object.entries(snapshotTree.trees).length === 0, message);
		assert(Object.entries(snapshotTree.blobs).length === 0, message);
	};

	const assertPopulatedGroupIdTree = (snapshotTree: ISnapshotTree, message: string) => {
		assert(snapshotTree.omitted === undefined, message);
		assert(snapshotTree.groupId === loadingGroupId, message);
		assert(Object.entries(snapshotTree.trees).length > 0, message);
		assert(Object.entries(snapshotTree.blobs).length > 0, message);
	};

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
	it("Can create loadingGroupId via detached flow", async () => {
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
		const dataObjectA = (await dataStore.entryPoint.get()) as TestDataObject;
		const dataObjectB = (await dataStore2.entryPoint.get()) as TestDataObject;
		mainObject._root.set("dataObjectA", dataObjectA.handle);
		mainObject._root.set("dataObjectB", dataObjectB.handle);

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

		// Intercept the first snapshot call via the creation of the driver
		const documentServiceFactory = provider.documentServiceFactory;
		const deferredSnapshot: Deferred<ISnapshot> = new Deferred();
		interceptResult(
			documentServiceFactory,
			documentServiceFactory.createDocumentService,
			(documentService) => {
				interceptResult(documentService, documentService.connectToStorage, (storage) => {
					assert(storage.getSnapshot !== undefined, "Test can't run without getSnapshot");
					interceptResult(storage, storage.getSnapshot, (snapshot) => {
						deferredSnapshot.resolve(snapshot);
					});
				});
			},
		);

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

		// Get the snapshot and runtime we just loaded from
		const loadingSnapshot3 = await deferredSnapshot.promise;

		// Testing the get snapshot call
		const mainObject3 = (await container3.getEntryPoint()) as TestDataObject;
		const runtime3 = mainObject3.containerRuntime;
		assert(runtime3.storage.getSnapshot !== undefined, "getSnapshot should be defined");
		const snapshot3 = await runtime3.storage.getSnapshot();
		assert.deepEqual(snapshot3, loadingSnapshot3, "Mismatched initial snapshots");

		// Snapshot validation (a snapshot call with NO loadingGroupIds)
		const channelsTree = loadingSnapshot3.snapshotTree.trees[".channels"];
		const mainObjectTree = channelsTree.trees[mainObject.id];
		const dataObjectATree = channelsTree.trees[dataObjectA.id];
		const dataObjectBTree = channelsTree.trees[dataObjectB.id];

		assertPopulatedRegularTree(mainObjectTree, "mainObject should be regular and populated");
		assertOmittedGroupIdTree(dataObjectATree, "Incorrect tree for A");
		assertOmittedGroupIdTree(dataObjectBTree, "Incorrect tree for B");

		// intercept loadingGroupId snapshot
		const groupIdSnapshot: Deferred<ISnapshot> = new Deferred();
		interceptResult(runtime3.storage, runtime3.storage.getSnapshot, (snapshot) => {
			groupIdSnapshot.resolve(snapshot);
		});

		// Try to load the data stores with groupIds
		const handleA3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		const handleB3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
		assert(handleA3 !== undefined, "handleA3 should not be undefined");
		assert(handleB3 !== undefined, "handleB3 should not be undefined");

		// Prep context snapshot intercept
		// Hack to inspect the runtime's dataStores
		const stores = (runtime3 as any).dataStores;
		const contextA = (await stores.getDataStore(dataObjectA.id, {})) as IFluidDataStoreContext;
		const contextB = (await stores.getDataStore(dataObjectB.id, {})) as IFluidDataStoreContext;
		assert(contextA.baseSnapshot !== undefined, "contextA should have a baseSnapshot");
		assert(contextB.baseSnapshot !== undefined, "contextB should have a baseSnapshot");
		assertOmittedGroupIdTree(contextA.baseSnapshot, "contextA tree should be omitted");
		assertOmittedGroupIdTree(contextB.baseSnapshot, "contextB tree should be omitted");

		// loading group call
		const dataObjectA3 = await handleA3.get();
		const dataObjectB3 = await handleB3.get();
		assert.equal(dataObjectA3._root.get("A"), "A", "A should be set");
		assert.equal(dataObjectB3._root.get("B"), "B", "B should be set");

		// Testing the get snapshot call with loadingGroupId
		const loadingGroupIdSnapshot = await runtime3.storage.getSnapshot({
			loadingGroupIds: [loadingGroupId],
			versionId: summaryVersion,
		});

		const groupSnapshot = await groupIdSnapshot.promise;
		assert.deepEqual(groupSnapshot, loadingGroupIdSnapshot, "Should be groupId snapshot");

		// Snapshot validation (a snapshot call for loadingGroupIds = [loadingGroupId])
		const channelsTree2 = groupSnapshot.snapshotTree.trees[".channels"];
		const mainObjectTree2 = channelsTree2.trees[mainObject.id];
		const dataObjectATree2 = channelsTree2.trees[dataObjectA.id];
		const dataObjectBTree2 = channelsTree2.trees[dataObjectB.id];

		assertOmittedRegularTree(mainObjectTree2, "mainObject should be regular and omitted");
		assertPopulatedGroupIdTree(dataObjectATree2, "Incorrect tree for A2");
		assertPopulatedGroupIdTree(dataObjectBTree2, "Incorrect tree for B2");
	});
});
