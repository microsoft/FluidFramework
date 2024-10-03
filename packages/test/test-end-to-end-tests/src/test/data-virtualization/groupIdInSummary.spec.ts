/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type {
	ConfigTypes,
	IConfigProviderBase,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISnapshot, ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { getSnapshotTree } from "@fluidframework/driver-utils/internal";
import type { IFluidDataStoreContext } from "@fluidframework/runtime-definitions/internal";
import {
	type ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import { TestPersistedCache } from "../../testPersistedCache.js";

import {
	clearCacheIfOdsp,
	isGroupIdLoaderVersion,
	isSupportedLoaderVersion,
	supportsDataVirtualization,
} from "./utils.js";

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

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describeCompat(
	"Create data store with group id",
	"LoaderCompat",
	(getTestObjectProvider, apis) => {
		const { DataObjectFactory, DataObject } = apis.dataRuntime;
		const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

		// A Test Data Object that exposes some basic functionality.
		class TestDataObject extends DataObject {
			public get _root() {
				return this.root;
			}

			public get containerRuntime() {
				return this.context.containerRuntime as IContainerRuntime;
			}

			public get loadingGroupId() {
				return this.context.loadingGroupId;
			}
		}

		// Allow us to control summaries
		const runtimeOptions: IContainerRuntimeOptions = {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
		};

		const testDataObjectType = "TestDataObject";
		const dataObjectFactory = new DataObjectFactory(
			testDataObjectType,
			TestDataObject,
			[],
			{},
		);

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
			blobContents: Map<string, ArrayBuffer>,
			message: string,
		) => {
			// Only local driver supports consistently omitting data from snapshots
			if (provider.driver.type !== "local") {
				return;
			}
			assert(snapshotTree.groupId === groupId, message);
			for (const tree of Object.values(snapshotTree.trees)) {
				assertOmittedTree(tree, groupId, blobContents, message);
			}
			for (const id of Object.values(snapshotTree.blobs)) {
				assert(!blobContents.has(id), `${message}: ${id}`);
			}
		};

		const assertOmittedBlobContents = (
			snapshot: ISnapshotTree | ISnapshot,
			groupId: string | undefined,
			blobContents: Map<string, ArrayBuffer>,
			message: string,
		) => {
			// Only local driver supports consistently omitting data from snapshots
			if (provider.driver.type !== "local") {
				return;
			}
			const snapshotTree = getSnapshotTree(snapshot);
			assert(snapshotTree.groupId === groupId, message);
			assert(assertOmittedBlobContentsCore(snapshotTree, groupId, blobContents), message);
		};

		const assertOmittedBlobContentsCore = (
			snapshotTree: ISnapshotTree,
			groupId: string | undefined,
			blobContents: Map<string, ArrayBuffer>,
		): boolean | undefined => {
			for (const id of Object.values(snapshotTree.blobs)) {
				// Even if 1 blob is missing, return true.
				if (!blobContents.has(id)) {
					return true;
				}
			}
			for (const tree of Object.values(snapshotTree.trees)) {
				if (tree.groupId === undefined) {
					const omitted = assertOmittedBlobContentsCore(tree, groupId, blobContents);
					if (omitted) {
						return true;
					}
				}
			}
		};

		const assertPopulatedTree = (
			snapshotTree: ISnapshotTree,
			groupId: string | undefined,
			blobContents: Map<string, ArrayBuffer>,
			message: string,
		) => {
			assert(snapshotTree.groupId === groupId, message);
			assertPopulatedTreeCore(snapshotTree, groupId, blobContents, message);
		};

		const assertPopulatedTreeCore = (
			snapshotTree: ISnapshotTree,
			groupId: string | undefined,
			blobContents: Map<string, ArrayBuffer>,
			message: string,
		) => {
			for (const id of Object.values(snapshotTree.blobs)) {
				assert(blobContents.has(id), message);
			}
			for (const tree of Object.values(snapshotTree.trees)) {
				if (tree.groupId === undefined || tree.groupId === groupId) {
					assertPopulatedTreeCore(tree, groupId, blobContents, message);
				}
			}
		};

		let dataObjectA = {} as unknown as TestDataObject;
		let dataObjectB = {} as unknown as TestDataObject;
		let dataObjectC = {} as unknown as TestDataObject;
		let dataObjectD = {} as unknown as TestDataObject;
		const persistedCache = new TestPersistedCache();
		beforeEach("setup", async function () {
			provider = getTestObjectProvider({ persistedCache });
			dataObjectA = {} as unknown as TestDataObject;
			dataObjectB = {} as unknown as TestDataObject;
			dataObjectC = {} as unknown as TestDataObject;
			dataObjectD = {} as unknown as TestDataObject;

			if (!isSupportedLoaderVersion(apis.loader.version)) {
				this.skip();
			}
		});

		afterEach("teardown", async () => {
			persistedCache.reset();
		});

		const noId = undefined;
		const loadingGroupId = "loadingGroupId";
		const loadingGroupId2 = "loadingGroupId2";
		const createDataObjectsWithGroupIds = async (
			mainObject: TestDataObject,
			containerRuntime: IContainerRuntime,
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
				undefined,
				undefined,
				undefined,
				undefined,
				configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
				}),
			);
			await provider.ensureSynchronized();
			const { summaryVersion, summaryTree } = await summarizeNow(summarizer);
			const channelsTree = summaryTree.tree[".channels"];
			assert(channelsTree.type === SummaryType.Tree, "channels should be a tree");
			const dataObjectTreeA = channelsTree.tree[dataObjectA.id];
			const dataObjectTreeB = channelsTree.tree[dataObjectB.id];
			assert(dataObjectTreeA !== undefined, "dataObjectTree should exist");
			assert(dataObjectTreeA.type === SummaryType.Tree, "dataObjectTree should be a tree");
			assert(
				dataObjectTreeA.groupId === loadingGroupId,
				"GroupId missing from A summary tree",
			);
			assert(dataObjectTreeB !== undefined, "dataObjectTree should exist");
			assert(dataObjectTreeB.type === SummaryType.Tree, "dataObjectTree should be a tree");
			assert(
				dataObjectTreeB.groupId === loadingGroupId,
				"GroupId missing from B summary tree",
			);

			clearCacheIfOdsp(provider, persistedCache);
			const container2 = await provider.loadContainer(
				runtimeFactory,
				{
					configProvider: configProvider({
						"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
					}),
				},
				{
					// For ODSP this technically doesn't work, but the cache is cleared so we get the "latest"
					[LoaderHeader.version]: summaryVersion,
				},
			);

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
			if (supportsDataVirtualization(provider)) {
				assert.equal(dataObjectA2.loadingGroupId, loadingGroupId, "A groupId not set");
				assert.equal(dataObjectB2.loadingGroupId, loadingGroupId, "B groupId not set");
				assert.equal(dataObjectC2.loadingGroupId, loadingGroupId2, "C groupId not set");
				assert.equal(dataObjectD2.loadingGroupId, loadingGroupId2, "D groupId not set");
			}
		});

		it("Loading Snapshot with GroupId using feature gate off should load properly", async function () {
			if (!supportsDataVirtualization(provider)) {
				this.skip();
			}
			const container = await provider.createContainer(runtimeFactory);
			const mainObject = (await container.getEntryPoint()) as TestDataObject;
			const containerRuntime = mainObject.containerRuntime;

			// Testing all apis for creating a data store with a loadingGroupId
			await createDataObjectsWithGroupIds(mainObject, containerRuntime);

			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container,
				dataObjectFactory,
				undefined,
				undefined,
				undefined,
				undefined,
				configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": false,
				}),
			);
			await provider.ensureSynchronized();
			const { summaryVersion, summaryTree } = await summarizeNow(summarizer);
			const channelsTree = summaryTree.tree[".channels"];
			assert(channelsTree.type === SummaryType.Tree, "channels should be a tree");
			const dataObjectTreeA = channelsTree.tree[dataObjectA.id];
			const dataObjectTreeB = channelsTree.tree[dataObjectB.id];
			assert(dataObjectTreeA !== undefined, "dataObjectTree should exist");
			assert(dataObjectTreeA.type === SummaryType.Tree, "dataObjectTree should be a tree");
			assert(
				dataObjectTreeA.groupId === loadingGroupId,
				"GroupId missing from A summary tree",
			);
			assert(dataObjectTreeB !== undefined, "dataObjectTree should exist");
			assert(dataObjectTreeB.type === SummaryType.Tree, "dataObjectTree should be a tree");
			assert(
				dataObjectTreeB.groupId === loadingGroupId,
				"GroupId missing from B summary tree",
			);

			clearCacheIfOdsp(provider, persistedCache);
			const container2 = await provider.loadContainer(
				runtimeFactory,
				{
					configProvider: configProvider({
						"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": false,
					}),
				},
				{
					// For ODSP this technically doesn't work, but the cache is cleared so we get the "latest"
					[LoaderHeader.version]: summaryVersion,
				},
			);

			const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
			const handleA2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
			const handleB2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
			const handleC2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectC");

			await assert.doesNotReject(
				mainObject2.containerRuntime.getAliasedDataStoreEntryPoint("dataObjectD"),
				"D should not be loaded",
			);
			assert(handleA2 !== undefined, "handleA2 should not be undefined");
			assert(handleB2 !== undefined, "handleB2 should not be undefined");
			assert(handleC2 !== undefined, "handleC2 should not be undefined");

			// When fixed, all these should not fail.
			await assert.doesNotReject(handleA2.get(), "should be able to retrieve A");
			await assert.doesNotReject(handleB2.get(), "should be able to retrieve B");
			await assert.doesNotReject(handleC2.get(), "should be able to retrieve C");
		});

		it("Can create loadingGroupId via detached flow", async () => {
			const container = await provider.createDetachedContainer(runtimeFactory);
			const mainObject = (await container.getEntryPoint()) as TestDataObject;
			const containerRuntime = mainObject.containerRuntime;

			await createDataObjectsWithGroupIds(mainObject, containerRuntime);

			await provider.attachDetachedContainer(container);
			if (supportsDataVirtualization(provider)) {
				const container2 = await provider.loadContainer(runtimeFactory, {
					configProvider: configProvider({
						"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
					}),
				});
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
			if (!supportsDataVirtualization(provider)) {
				return;
			}

			const loaderSupport = isGroupIdLoaderVersion(apis.loader.version);
			// Load basic container stuff
			const container = await provider.createContainer(runtimeFactory);
			const mainObject = (await container.getEntryPoint()) as TestDataObject;
			const containerRuntime = mainObject.containerRuntime;

			await createDataObjectsWithGroupIds(mainObject, containerRuntime);
			dataObjectA._root.set("A", "A");
			mainObject._root.set("doubleHandleA", dataObjectA.handle);
			dataObjectB._root.set("B", "B");
			dataObjectC._root.set("C", "C");
			dataObjectD._root.set("D", "D");

			// Summarize
			await provider.ensureSynchronized();
			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container,
				dataObjectFactory,
				undefined,
				undefined,
				undefined,
				undefined,
				configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
				}),
			);
			const { summaryVersion, summaryRefSeq } = await summarizeNow(summarizer);

			// Intercept the first snapshot call via the creation of the driver
			const documentServiceFactory = provider.documentServiceFactory;
			let snapshotCaptured: ISnapshot | undefined;
			let callCount: number = 0;
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

			clearCacheIfOdsp(provider, persistedCache);

			// Load from the summary
			const container2 = await provider.loadContainer(
				runtimeFactory,
				{
					configProvider: configProvider({
						"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
					}),
				},
				{
					[LoaderHeader.version]: summaryVersion,
				},
			);

			// Get the snapshot and runtime we just loaded from
			const loadingSnapshot = snapshotCaptured;
			// Testing the get snapshot call
			const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
			const runtime2 = mainObject2.containerRuntime;
			if (loaderSupport) {
				assert(loadingSnapshot !== undefined, "should have captured loading snapshot!");
				assert(runtime2.storage.getSnapshot !== undefined, "getSnapshot should be defined");
				assert.equal(callCount, 1, "Should have only called getSnapshot once");
				assert(
					loadingSnapshot?.sequenceNumber === summaryRefSeq,
					"Loaded from wrong snapshot",
				);

				const blobContents = loadingSnapshot.blobContents;
				// Snapshot validation (a snapshot call with NO loadingGroupIds)
				const channelsTree = loadingSnapshot.snapshotTree.trees[".channels"];
				const mainObjectTree = channelsTree.trees[mainObject.id];
				const dataObjectATree = channelsTree.trees[dataObjectA.id];
				const dataObjectBTree = channelsTree.trees[dataObjectB.id];
				const dataObjectCTree = channelsTree.trees[dataObjectC.id];
				const dataObjectDTree = channelsTree.trees[dataObjectD.id];

				assertPopulatedTree(mainObjectTree, noId, blobContents, "mainObject tree not right");
				assertOmittedBlobContents(
					dataObjectATree,
					loadingGroupId,
					blobContents,
					"Wrong tree for A",
				);
				assertOmittedBlobContents(
					dataObjectBTree,
					loadingGroupId,
					blobContents,
					"Wrong tree for B",
				);
				assertOmittedBlobContents(
					dataObjectCTree,
					loadingGroupId2,
					blobContents,
					"Wrong tree for C",
				);
				assertOmittedBlobContents(
					dataObjectDTree,
					loadingGroupId2,
					blobContents,
					"Wrong tree for D",
				);
			}

			callCount = 0;

			// Try to load the data stores with groupIds
			const doubleHandleA2 =
				mainObject2._root.get<IFluidHandle<TestDataObject>>("doubleHandleA");
			const handleA2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
			const handleB2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
			assert(doubleHandleA2 !== undefined, "doubleHandleA2 should not be undefined");
			assert(handleA2 !== undefined, "handleA2 should not be undefined");
			assert(handleB2 !== undefined, "handleB2 should not be undefined");

			// Prep context snapshot intercept
			// Hack to inspect the runtime's dataStores
			const stores = (runtime2 as any).channelCollection;
			const contextA = (await stores.getDataStore(
				dataObjectA.id,
				{},
			)) as IFluidDataStoreContext;
			const contextB = (await stores.getDataStore(
				dataObjectB.id,
				{},
			)) as IFluidDataStoreContext;
			const contextC = (await stores.getDataStore(
				dataObjectC.id,
				{},
			)) as IFluidDataStoreContext;
			const contextD = (await stores.getDataStore(
				dataObjectD.id,
				{},
			)) as IFluidDataStoreContext;
			assert(contextA.baseSnapshot !== undefined, "contextA should have a baseSnapshot");
			assert(contextB.baseSnapshot !== undefined, "contextB should have a baseSnapshot");
			assert(contextC.baseSnapshot !== undefined, "contextC should have a baseSnapshot");
			assert(contextD.baseSnapshot !== undefined, "contextD should have a baseSnapshot");

			assert.equal(callCount, 0, "Should not have made any network calls");
			if (loaderSupport) {
				assert(loadingSnapshot !== undefined, "should have captured loading snapshot!");
				const blobContents = loadingSnapshot.blobContents;
				assertOmittedBlobContents(
					contextA.baseSnapshot,
					loadingGroupId,
					blobContents,
					"contextA tree not omitted",
				);
				assertOmittedBlobContents(
					contextB.baseSnapshot,
					loadingGroupId,
					blobContents,
					"contextB tree not omitted",
				);
				assertOmittedBlobContents(
					contextC.baseSnapshot,
					loadingGroupId2,
					blobContents,
					"contextC tree not omitted",
				);
				assertOmittedBlobContents(
					contextD.baseSnapshot,
					loadingGroupId2,
					blobContents,
					"contextD tree not omitted",
				);
			}

			// loading group call
			assert.equal(callCount, 0, "Should not have made any network calls");
			const [dataObjectA2, dataObjectB2] = await Promise.all([handleA2.get(), handleB2.get()]);
			if (loaderSupport) {
				assert.equal(callCount, 1, "Should have only called getSnapshot once!");
			}
			callCount = 0;
			assert.equal(dataObjectA2._root.get("A"), "A", "A should be set");
			assert.equal(dataObjectB2._root.get("B"), "B", "B should be set");
			assert.equal(callCount, 0, "retrieving data should not have made any network calls");

			callCount = 0;
			const aDataObjectA2 = await doubleHandleA2.get();
			assert.equal(callCount, 0, "Network call made on same object!");
			assert.equal(aDataObjectA2, dataObjectA2, "Should be the same object");

			// Testing the get snapshot call with loadingGroupId
			if (loaderSupport) {
				const groupSnapshot = snapshotCaptured;
				assert(groupSnapshot !== undefined, "should have captured group snapshot!");
				const blobContents = groupSnapshot.blobContents;
				assert.deepEqual(
					groupSnapshot.sequenceNumber,
					summaryRefSeq,
					"Should be groupId snapshot",
				);

				// Snapshot validation (a snapshot call for loadingGroupIds = [loadingGroupId])
				const channelsTree2 = groupSnapshot.snapshotTree.trees[".channels"];
				const mainObjectTree2 = channelsTree2.trees[mainObject.id];
				const dataObjectATree2 = channelsTree2.trees[dataObjectA.id];
				const dataObjectBTree2 = channelsTree2.trees[dataObjectB.id];
				const dataObjectCTree2 = channelsTree2.trees[dataObjectC.id];
				const dataObjectDTree2 = channelsTree2.trees[dataObjectD.id];

				assertOmittedTree(mainObjectTree2, noId, blobContents, "mainObject tree incorrect");
				assertPopulatedTree(
					dataObjectATree2,
					loadingGroupId,
					blobContents,
					"Incorrect tree for A2",
				);
				assertPopulatedTree(
					dataObjectBTree2,
					loadingGroupId,
					blobContents,
					"Incorrect tree for B2",
				);
				assertOmittedTree(
					dataObjectCTree2,
					loadingGroupId2,
					blobContents,
					"Incorrect tree for C2",
				);
				assertOmittedTree(
					dataObjectDTree2,
					loadingGroupId2,
					blobContents,
					"Incorrect tree for D2",
				);
			}

			const handleC2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectC");
			// This call realizes the data object
			const handleD2 = await runtime2.getAliasedDataStoreEntryPoint("dataObjectD");
			assert(handleC2 !== undefined, "handleC2 should not be undefined");
			assert(handleD2 !== undefined, "handleD2 should not be undefined");

			await handleC2.get();
			await handleD2.get();

			// Snapshot validation (a snapshot call for loadingGroupIds = [loadingGroupId])
			if (loaderSupport) {
				const group2Snapshot = snapshotCaptured;
				assert(group2Snapshot !== undefined, "should have captured group2 snapshot!");
				const blobContents = group2Snapshot.blobContents;
				assert.deepEqual(group2Snapshot.sequenceNumber, summaryRefSeq, "Unexpected snapshot");
				const channels2Tree2 = group2Snapshot.snapshotTree.trees[".channels"];
				const mainObject2Tree2 = channels2Tree2.trees[mainObject.id];
				const dataObjectA2Tree2 = channels2Tree2.trees[dataObjectA.id];
				const dataObjectB2Tree2 = channels2Tree2.trees[dataObjectB.id];
				const dataObjectC2Tree2 = channels2Tree2.trees[dataObjectC.id];
				const dataObjectD2Tree2 = channels2Tree2.trees[dataObjectD.id];

				assertOmittedTree(
					mainObject2Tree2,
					noId,
					blobContents,
					"Not omitted tree for mainObject",
				);
				assertOmittedTree(
					dataObjectA2Tree2,
					loadingGroupId,
					blobContents,
					"Not omitted tree for A2",
				);
				assertOmittedTree(
					dataObjectB2Tree2,
					loadingGroupId,
					blobContents,
					"Not omitted tree for B2",
				);
				assertPopulatedTree(
					dataObjectC2Tree2,
					loadingGroupId2,
					blobContents,
					"Not populated tree for C2",
				);
				assertPopulatedTree(
					dataObjectD2Tree2,
					loadingGroupId2,
					blobContents,
					"Not populated tree for D2",
				);
			}
		});
	},
);
