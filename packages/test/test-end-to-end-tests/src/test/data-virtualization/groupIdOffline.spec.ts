/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import {
	type ContainerRuntime,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISnapshot } from "@fluidframework/driver-definitions/internal";
import {
	type ITestObjectProvider,
	createTestConfigProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import { TestSnapshotCache } from "./testSnapshotCache.js";
import { clearCacheIfOdsp, supportsDataVirtualization } from "./utils.js";

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

describeCompat("GroupId offline", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObjectFactory, DataObject } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

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

	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};
	const configProvider = createTestConfigProvider();
	configProvider.set("Fluid.Container.UseLoadingGroupIdForSnapshotFetch", true);
	configProvider.set("Fluid.Container.enableOfflineLoad", true);

	const testDataObjectType = "TestDataObject";
	const dataObjectFactory = new DataObjectFactory(testDataObjectType, TestDataObject, [], {});

	// The 1st runtime factory, V1 of the code
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;
	let callCount = 0;
	let latestSnapshot: ISnapshot | undefined;
	const persistedCache = new TestSnapshotCache();
	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ persistedCache });
		if (!supportsDataVirtualization(provider)) {
			this.skip();
		}

		const documentServiceFactory = provider.documentServiceFactory;
		interceptResult(
			documentServiceFactory,
			documentServiceFactory.createDocumentService,
			(documentService) => {
				interceptResult(documentService, documentService.connectToStorage, (storage) => {
					assert(storage.getSnapshot !== undefined, "Test can't run without getSnapshot");
					interceptResult(storage, storage.getSnapshot, (snapshot) => {
						latestSnapshot = snapshot;
						callCount++;
					});
				});
			},
		);
	});

	afterEach("teardown", async () => {
		persistedCache.reset();
	});

	const loadingGroupId = "loadingGroupId";

	it("GroupId offline regular flow", async () => {
		// Load basic container stuff
		const container = (await provider.createContainer(runtimeFactory, {
			configProvider,
		})) as IContainerExperimental;
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
		container.disconnect();
		dataObjectA._root.set("A", "A");
		dataObjectB._root.set("B", "B");

		// Get Pending state and close
		assert(
			container.closeAndGetPendingLocalState !== undefined,
			"Test can't run without closeAndGetPendingLocalState",
		);
		const pendingState = await container.closeAndGetPendingLocalState();

		// Load from the pending state
		const container3 = await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
			undefined,
			pendingState,
		);

		// Testing the get snapshot call
		const mainObject3 = (await container3.getEntryPoint()) as TestDataObject;
		const runtime3 = mainObject3.containerRuntime;
		assert(runtime3.storage.getSnapshot !== undefined, "getSnapshot should be defined");

		// Try to load the data stores with groupIds
		const handleA3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		const handleB3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
		assert(handleA3 !== undefined, "handleA3 should not be undefined");
		assert(handleB3 !== undefined, "handleB3 should not be undefined");

		// loading group call
		callCount = 0;
		const dataObjectA3 = await handleA3.get();
		const dataObjectB3 = await handleB3.get();
		assert.equal(callCount, 0, "No network call should be made");
		assert.equal(dataObjectA3._root.get("A"), "A", "A should be set");
		assert.equal(dataObjectB3._root.get("B"), "B", "B should be set");
	});

	it("GroupId offline with older snapshot", async () => {
		// Load basic container stuff
		const container = await provider.createContainer(runtimeFactory, {
			configProvider,
		});
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

		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactory,
			undefined,
			undefined,
			undefined,
			undefined,
			configProvider,
		);

		const { summaryVersion } = await summarizeNow(summarizer);
		clearCacheIfOdsp(provider, persistedCache);

		const container2 = (await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
			{ [LoaderHeader.version]: summaryVersion },
		)) as IContainerExperimental;
		const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const handleA2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		const handleB2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
		assert(handleA2 !== undefined, "handleA2 should not be undefined");
		assert(handleB2 !== undefined, "handleB2 should not be undefined");

		const dataObjectA2 = await handleA2.get();
		assert.equal(dataObjectA2._root.get("A"), "A", "A should be set");
		container2.disconnect();
		dataObjectA2._root.set("A2", "A2");

		// Get Pending state and close
		assert(container2.closeAndGetPendingLocalState !== undefined, "Missing method!");
		const pendingState = await container2.closeAndGetPendingLocalState();

		// Load from the pending state
		const container3 = await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
			undefined,
			pendingState,
		);
		container3.disconnect();

		// Testing the get snapshot call
		const mainObject3 = (await container3.getEntryPoint()) as TestDataObject;
		const runtime3 = mainObject3.containerRuntime;
		assert(runtime3.storage.getSnapshot !== undefined, "getSnapshot should be defined");

		// Try to load the data stores with groupIds
		const handleA3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		const handleB3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
		assert(handleA3 !== undefined, "handleA3 should not be undefined");
		assert(handleB3 !== undefined, "handleB3 should not be undefined");

		// loading group call
		callCount = 0;
		const dataObjectA3 = await handleA3.get();
		const dataObjectB3 = await handleB3.get();
		assert.equal(callCount, 0, "No network call should be made after older snapshot");
		assert.equal(dataObjectA3._root.get("A"), "A", "A should be set");
		assert.equal(dataObjectA3._root.get("A2"), "A2", "A2 should be set");
		assert.equal(dataObjectB3._root.get("B"), "B", "B should be set");
		container3.connect();
		await provider.ensureSynchronized();
	});

	it("GroupId offline with refresh", async () => {
		// Load basic container stuff
		const container = (await provider.createContainer(runtimeFactory, {
			configProvider,
		})) as IContainerExperimental;
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
		await provider.ensureSynchronized();

		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactory,
			undefined,
			undefined,
			undefined,
			undefined,
			configProvider,
		);
		const initialSummaryVersion = latestSnapshot?.snapshotTree.id;
		assert(initialSummaryVersion !== undefined, "Initial summary version should be defined");
		const { summaryVersion } = await summarizeNow(summarizer);
		await provider.ensureSynchronized();

		clearCacheIfOdsp(provider, persistedCache);

		const container2 = (await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
			{ [LoaderHeader.version]: summaryVersion },
		)) as IContainerExperimental;
		await provider.ensureSynchronized();
		const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const handleA2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		const handleB2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
		callCount = 0;
		const dataObjectA2 = await handleA2?.get();
		const dataObjectB2 = await handleB2?.get();
		assert.equal(callCount, 1, "Should have made a network call");
		assert(dataObjectA2 !== undefined, "dataObjectA2 should not be undefined");
		assert(dataObjectB2 !== undefined, "dataObjectB2 should not be undefined");
		dataObjectA2._root.set("A", "A");
		dataObjectB2._root.set("B", "B");
		await provider.ensureSynchronized();

		const { summaryRefSeq } = await summarizeNow(summarizer);
		await provider.ensureSynchronized();

		// Refresh snapshot - this to validate that we built a system that would work with refresh
		// There are two parts to refresh, making the network snapshot call and trimming the ops
		// Container layer Refresh
		// Network call refreshing the base snapshot
		const serializedStateManager = (
			container2 as unknown as {
				// See SerializedStateManager class in container-loader package
				serializedStateManager: {
					refreshLatestSnapshot: (supportGetSnapshotApi: boolean) => Promise<void>;
				};
			}
		).serializedStateManager;
		clearCacheIfOdsp(provider, persistedCache);

		await serializedStateManager.refreshLatestSnapshot(true);

		// Update the latestSequenceNumber so that the reference sequence number is beyond the snapshot
		await provider.ensureSynchronized();
		container2.disconnect();
		dataObjectA2._root.set("A2", "A2");
		dataObjectB2._root.set("B2", "B2");

		// Hack to make sure we don't immediately fail/close the container on pending ops
		// Another way around this is to simply have a different container send remote messages.
		// What happens is that the last two synced ops we made are considered "saved", This may be useful for testing an offline edge case
		// The last two saved ops (setting A and B) have reference sequence numbers that point to a sequence number
		// before the snapshot
		(dataObjectA2.containerRuntime as any).pendingStateManager.savedOps = [];
		// Get Pending state and close
		assert(container2.closeAndGetPendingLocalState !== undefined, "Missing method!");
		const pendingState = await container2.closeAndGetPendingLocalState();

		// Load from the pending state
		const container3 = await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
			undefined,
			pendingState,
		);
		container3.disconnect();
		// This needs to be true otherwise data virtualization will not work with offline refresh as
		// the initial sequence number will be greater than the refreshed snapshot's sequence number.
		assert(
			container3.deltaManager.initialSequenceNumber === summaryRefSeq,
			"Should have loaded from initial seq",
		);
		assert(
			container3.deltaManager.lastSequenceNumber > summaryRefSeq,
			"Should have latest seq",
		);

		// Testing the get snapshot call
		const mainObject3 = (await container3.getEntryPoint()) as TestDataObject;
		const runtime3 = mainObject3.containerRuntime;
		assert(runtime3.storage.getSnapshot !== undefined, "getSnapshot should be defined");

		// Try to load the data stores with groupIds
		const handleA3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		const handleB3 = mainObject3._root.get<IFluidHandle<TestDataObject>>("dataObjectB");
		assert(handleA3 !== undefined, "handleA3 should not be undefined");
		assert(handleB3 !== undefined, "handleB3 should not be undefined");

		// loading group call
		callCount = 0;
		const dataObjectA3 = await handleA3.get();
		const dataObjectB3 = await handleB3.get();
		assert.equal(dataObjectA3._root.get("A"), "A", "A should be set");
		assert.equal(dataObjectA3._root.get("A2"), "A2", "A2 should be set");
		assert.equal(dataObjectB3._root.get("B"), "B", "B should be set");
		assert.equal(dataObjectB3._root.get("B2"), "B2", "B2 should be set");
		assert(callCount === 0, "Should not have made a network call");
	});
});
