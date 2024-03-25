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
import { LoaderHeader } from "@fluidframework/container-definitions";
import {
	type ContainerRuntime,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISnapshot } from "@fluidframework/driver-definitions";
import { type ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
	type ITestObjectProvider,
	createSummarizerFromFactory,
	createTestConfigProvider,
	summarizeNow,
} from "@fluidframework/test-utils";

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

	const assertOmittedTree = (
		snapshotTree: ISnapshotTree,
		groupId: string | undefined,
		message: string,
	) => {
		assert(snapshotTree.omitted, message);
		assert(snapshotTree.groupId === groupId, message);
		assert(Object.entries(snapshotTree.trees).length === 0, message);
		assert(Object.entries(snapshotTree.blobs).length === 0, message);
	};

	const assertPopulatedTree = (
		snapshotTree: ISnapshotTree,
		groupId: string | undefined,
		message: string,
	) => {
		assert(snapshotTree.omitted === undefined, message);
		assert(snapshotTree.groupId === groupId, message);
		assert(Object.entries(snapshotTree.trees).length > 0, message);
		assert(Object.entries(snapshotTree.blobs).length > 0, message);
	};

	let dataObjectA = {} as unknown as TestDataObject;
	let dataObjectB = {} as unknown as TestDataObject;
	let dataObjectC = {} as unknown as TestDataObject;
	let dataObjectD = {} as unknown as TestDataObject;
	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		dataObjectA = {} as unknown as TestDataObject;
		dataObjectB = {} as unknown as TestDataObject;
		dataObjectC = {} as unknown as TestDataObject;
		dataObjectD = {} as unknown as TestDataObject;
	});

	const noId = undefined;
	const loadingGroupId = "loadingGroupId";
	const loadingGroupId2 = "loadingGroupId2";
	const createDataObjectsWithGroupIds = async (
		mainObject: TestDataObject,
		containerRuntime: ContainerRuntime,
	) => {
		dataObjectA = await dataObjectFactory.createInstance(
			containerRuntime,
			undefined,
			loadingGroupId,
		);
		const dataStoreB = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);
		dataObjectB = (await dataStoreB.entryPoint.get()) as TestDataObject;

		[dataObjectC] = await dataObjectFactory.createInstanceWithDataStore(
			containerRuntime,
			undefined,
			undefined,
			loadingGroupId2,
		);
		const [objD, dataStoreD] = await dataObjectFactory.createInstanceWithDataStore(
			containerRuntime,
			undefined,
			undefined,
			loadingGroupId2,
		);
		dataObjectD = objD;

		mainObject._root.set("dataObjectA", dataObjectA.handle);
		mainObject._root.set("dataObjectB", dataObjectB.handle);
		mainObject._root.set("dataObjectC", dataObjectC.handle);
		const result = await dataStoreD.trySetAlias("dataObjectD");
		assert(result === "Success", "Alias should be set");
	};

	it("Can create loadingGroupId", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const mainObject = (await container.getEntryPoint()) as TestDataObject;
		const containerRuntime = mainObject.containerRuntime;

		// Testing all apis for creating a data store with a loadingGroupId
		await createDataObjectsWithGroupIds(mainObject, containerRuntime);

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

		const container2 = await provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});

		const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const handleA2 = mainObject2._root.get("dataObjectA");
		const handleB2 = mainObject2._root.get("dataObjectB");
		const handleC2 = mainObject2._root.get("dataObjectC");
		const handleD2 =
			await mainObject2.containerRuntime.getAliasedDataStoreEntryPoint("dataObjectD");
		assert(handleA2 !== undefined, "handleA2 should not be undefined");
		assert(handleB2 !== undefined, "handleB2 should not be undefined");
		assert(handleC2 !== undefined, "handleC2 should not be undefined");
		assert(handleD2 !== undefined, "handleD2 should not be undefined");
		const dataObjectA2 = (await handleA2.get()) as TestDataObject;
		const dataObjectB2 = (await handleB2.get()) as TestDataObject;
		const dataObjectC2 = (await handleC2.get()) as TestDataObject;
		const dataObjectD2 = (await handleD2.get()) as TestDataObject;

		// TODO: Enable this portion in tinylicious
		// This allows us to test against services without groupId enabled.
		// Round tripping of groupId only works for local driver, regardless the rest should just work as intended
		if (provider.driver.type === "local") {
			assert.equal(dataObjectA2.loadingGroupId, loadingGroupId, "A groupId not set");
			assert.equal(dataObjectB2.loadingGroupId, loadingGroupId, "B groupId not set");
			assert.equal(dataObjectC2.loadingGroupId, loadingGroupId2, "B groupId not set");
			assert.equal(dataObjectD2.loadingGroupId, loadingGroupId2, "B groupId not set");
		}
	});

	it("Can create loadingGroupId via detached flow", async () => {
		const container = await provider.createDetachedContainer(runtimeFactory);
		const mainObject = (await container.getEntryPoint()) as TestDataObject;
		const containerRuntime = mainObject.containerRuntime;

		await createDataObjectsWithGroupIds(mainObject, containerRuntime);

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

		await createDataObjectsWithGroupIds(mainObject, containerRuntime);
		dataObjectA._root.set("A", "A");
		mainObject._root.set("doubleHandleA", dataObjectA.handle);
		dataObjectB._root.set("B", "B");

		// Summarize
		await provider.ensureSynchronized();
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactory,
		);
		const { summaryVersion, summaryRefSeq } = await summarizeNow(summarizer);

		// Intercept the first snapshot call via the creation of the driver
		const documentServiceFactory = provider.documentServiceFactory;
		let snapshotCaptured: ISnapshot | undefined;
		let callCount = 0;
		interceptResult(
			documentServiceFactory,
			documentServiceFactory.createDocumentService,
			(documentService) => {
				interceptResult(documentService, documentService.connectToStorage, (storage) => {
					assert(storage.getSnapshot !== undefined, "Test can't run without getSnapshot");
					interceptResult(storage, storage.getSnapshot, (snapshot) => {
						snapshotCaptured = snapshot;
						callCount++;
					});
				});
			},
		);

		// Load from the summary
		const configProvider = createTestConfigProvider();
		configProvider.set("Fluid.Container.UseLoadingGroupIdForSnapshotFetch", true);
		const container2 = await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
			{
				[LoaderHeader.version]: summaryVersion,
			},
		);

		// Get the snapshot and runtime we just loaded from
		const loadingSnapshot = snapshotCaptured;
		assert(loadingSnapshot !== undefined, "should have captured loading snapshot!");

		// Testing the get snapshot call
		const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const runtime2 = mainObject2.containerRuntime;
		assert(runtime2.storage.getSnapshot !== undefined, "getSnapshot should be defined");
		assert(callCount === 1, "Should have only called getSnapshot once");
		assert(loadingSnapshot.sequenceNumber === summaryRefSeq, "Loaded from wrong snapshot");

		// Snapshot validation (a snapshot call with NO loadingGroupIds)
		const channelsTree = loadingSnapshot.snapshotTree.trees[".channels"];
		const mainObjectTree = channelsTree.trees[mainObject.id];
		const dataObjectATree = channelsTree.trees[dataObjectA.id];
		const dataObjectBTree = channelsTree.trees[dataObjectB.id];
		const dataObjectCTree = channelsTree.trees[dataObjectC.id];
		const dataObjectDTree = channelsTree.trees[dataObjectD.id];

		assertPopulatedTree(mainObjectTree, noId, "mainObject tree not right");
		assertOmittedTree(dataObjectATree, loadingGroupId, "Wrong tree for A");
		assertOmittedTree(dataObjectBTree, loadingGroupId, "Wrong tree for B");
		assertOmittedTree(dataObjectCTree, loadingGroupId2, "Wrong tree for C");
		assertOmittedTree(dataObjectDTree, loadingGroupId2, "Wrong tree for D");

		callCount = 0;

		// Try to load the data stores with groupIds
		const doubleHandleA2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("doubleHandleA");
		const handleA2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		const handleB2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
		assert(doubleHandleA2 !== undefined, "doubleHandleA2 should not be undefined");
		assert(handleA2 !== undefined, "handleA2 should not be undefined");
		assert(handleB2 !== undefined, "handleB2 should not be undefined");

		// Prep context snapshot intercept
		// Hack to inspect the runtime's dataStores
		const stores = (runtime2 as any).channelCollection;
		const contextA = (await stores.getDataStore(dataObjectA.id, {})) as IFluidDataStoreContext;
		const contextB = (await stores.getDataStore(dataObjectB.id, {})) as IFluidDataStoreContext;
		const contextC = (await stores.getDataStore(dataObjectC.id, {})) as IFluidDataStoreContext;
		const contextD = (await stores.getDataStore(dataObjectD.id, {})) as IFluidDataStoreContext;
		assert(contextA.baseSnapshot !== undefined, "contextA should have a baseSnapshot");
		assert(contextB.baseSnapshot !== undefined, "contextB should have a baseSnapshot");
		assert(contextC.baseSnapshot !== undefined, "contextC should have a baseSnapshot");
		assert(contextD.baseSnapshot !== undefined, "contextD should have a baseSnapshot");

		assert.equal(callCount, 0, "Should not have made any network calls");
		assertOmittedTree(contextA.baseSnapshot, loadingGroupId, "contextA tree not omitted");
		assertOmittedTree(contextB.baseSnapshot, loadingGroupId, "contextB tree not omitted");
		assertOmittedTree(contextC.baseSnapshot, loadingGroupId2, "contextC tree not omitted");
		assertOmittedTree(contextD.baseSnapshot, loadingGroupId2, "contextD tree not omitted");

		// loading group call
		assert.equal(callCount, 0, "Should not have made any network calls");
		const [dataObjectA2, dataObjectB2] = await Promise.all([handleA2.get(), handleB2.get()]);
		assert.equal(callCount, 1, "Should have only called getSnapshot once!");
		assert.equal(dataObjectA2._root.get("A"), "A", "A should be set");
		assert.equal(dataObjectB2._root.get("B"), "B", "B should be set");
		assert.equal(callCount, 1, "retrieving data should not have made any network calls");

		callCount = 0;
		const aDataObjectA2 = await doubleHandleA2.get();
		assert.equal(callCount, 0, "Network call made on same object!");
		assert.equal(aDataObjectA2, dataObjectA2, "Should be the same object");

		// Testing the get snapshot call with loadingGroupId
		const groupSnapshot = snapshotCaptured;
		assert(groupSnapshot !== undefined, "should have captured group snapshot!");
		assert.deepEqual(groupSnapshot.sequenceNumber, summaryRefSeq, "Should be groupId snapshot");

		// Snapshot validation (a snapshot call for loadingGroupIds = [loadingGroupId])
		const channelsTree2 = groupSnapshot.snapshotTree.trees[".channels"];
		const mainObjectTree2 = channelsTree2.trees[mainObject.id];
		const dataObjectATree2 = channelsTree2.trees[dataObjectA.id];
		const dataObjectBTree2 = channelsTree2.trees[dataObjectB.id];
		const dataObjectCTree2 = channelsTree2.trees[dataObjectC.id];
		const dataObjectDTree2 = channelsTree2.trees[dataObjectD.id];

		assertOmittedTree(mainObjectTree2, noId, "mainObject tree incorrect");
		assertPopulatedTree(dataObjectATree2, loadingGroupId, "Incorrect tree for A2");
		assertPopulatedTree(dataObjectBTree2, loadingGroupId, "Incorrect tree for B2");
		assertOmittedTree(dataObjectCTree2, loadingGroupId2, "Incorrect tree for C2");
		assertOmittedTree(dataObjectDTree2, loadingGroupId2, "Incorrect tree for D2");

		const handleC2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectC");
		assert.equal(callCount, 0, "call count should be reset");
		// This call realizes the data object
		const handleD2 = await runtime2.getAliasedDataStoreEntryPoint("dataObjectD");
		assert.equal(callCount, 1, "Extra calls made");
		assert(handleC2 !== undefined, "handleC2 should not be undefined");
		assert(handleD2 !== undefined, "handleD2 should not be undefined");

		callCount = 0;
		await handleC2.get();
		await handleD2.get();
		assert.equal(callCount, 0, "Some extra calls were made");

		// Snapshot validation (a snapshot call for loadingGroupIds = [loadingGroupId])
		const group2Snapshot = snapshotCaptured;
		assert(group2Snapshot !== undefined, "should have captured group2 snapshot!");
		assert.deepEqual(group2Snapshot.sequenceNumber, summaryRefSeq, "Unexpected snapshot");
		const channels2Tree2 = group2Snapshot.snapshotTree.trees[".channels"];
		const mainObject2Tree2 = channels2Tree2.trees[mainObject.id];
		const dataObjectA2Tree2 = channels2Tree2.trees[dataObjectA.id];
		const dataObjectB2Tree2 = channels2Tree2.trees[dataObjectB.id];
		const dataObjectC2Tree2 = channels2Tree2.trees[dataObjectC.id];
		const dataObjectD2Tree2 = channels2Tree2.trees[dataObjectD.id];

		assertOmittedTree(mainObject2Tree2, noId, "Not omitted tree for mainObject");
		assertOmittedTree(dataObjectA2Tree2, loadingGroupId, "Not omitted tree for A2");
		assertOmittedTree(dataObjectB2Tree2, loadingGroupId, "Not omitted tree for B2");
		assertPopulatedTree(dataObjectC2Tree2, loadingGroupId2, "Not populated tree for C2");
		assertPopulatedTree(dataObjectD2Tree2, loadingGroupId2, "Not populated tree for D2");
	});
});
