/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	type ContainerRuntime,
	type IContainerRuntimeOptions,
	SummarizerStopReason,
} from "@fluidframework/container-runtime/internal";
import type {
	ConfigTypes,
	IConfigProviderBase,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { Deferred, delay } from "@fluidframework/core-utils/internal";
import type { ISnapshot, ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	type ITestObjectProvider,
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

const overrideResult = <T>(parent: any, fn: (...args: any[]) => Promise<T>, result: T) => {
	const overrideFn = async () => {
		return result;
	};
	parent[fn.name] = overrideFn;
};

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describeCompat("Create data store with group id", "NoCompat", (getTestObjectProvider, apis) => {
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

	const testDataObjectType = "TestDataObject";
	const dataObjectFactory = new DataObjectFactory(testDataObjectType, TestDataObject, [], {});

	// The 1st runtime factory, V1 of the code
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;
	const assertPopulatedGroupIdTree = (
		snapshotTree: ISnapshotTree,
		blobContents: Map<string, ArrayBuffer>,
		message: string,
	) => {
		assert(snapshotTree.groupId === loadingGroupId, message);
		assertPopulatedTreeCore(snapshotTree, loadingGroupId, blobContents, message);
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

	const persistedCache = new TestSnapshotCache();
	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ persistedCache });
		if (!supportsDataVirtualization(provider)) {
			this.skip();
		}
	});
	afterEach(async () => {
		persistedCache.reset();
	});

	const loadingGroupId = "loadingGroupId";
	it("Load datastore via groupId with snapshot in the future, with seq < all the ops", async () => {
		// Load basic container stuff
		const container = await provider.createContainer(runtimeFactory, {
			configProvider: configProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
			}),
		});
		const mainObject = (await container.getEntryPoint()) as TestDataObject;
		const containerRuntime = mainObject.containerRuntime;

		// Create data stores with loadingGroupIds
		const dataStoreA = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);

		// Attach the data stores
		const dataObjectA = (await dataStoreA.entryPoint.get()) as TestDataObject;
		mainObject._root.set("dataObjectA", dataObjectA.handle);
		dataObjectA._root.set("A", "A");

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
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
			}),
		);
		const { summaryVersion } = await summarizeNow(summarizer);
		clearCacheIfOdsp(provider, persistedCache);
		const container2 = await provider.loadContainer(
			runtimeFactory,
			{
				configProvider: configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
				}),
			},
			{ [LoaderHeader.version]: summaryVersion },
		);
		await provider.ensureSynchronized();

		dataObjectA._root.set("B", "B");
		await provider.ensureSynchronized();
		const { summaryRefSeq } = await summarizeNow(summarizer);

		// Testing the get snapshot call
		const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const runtime2 = mainObject2.containerRuntime;

		// Try to load the data stores with groupIds
		const handleA2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		assert(handleA2 !== undefined, "handleA2 should not be undefined");

		const snapshotADeferred: Deferred<ISnapshot> = new Deferred();
		assert(runtime2.storage.getSnapshot !== undefined, "getSnapshot not defined for runtime2");
		interceptResult(runtime2.storage, runtime2.storage.getSnapshot, (snapshot) => {
			snapshotADeferred.resolve(snapshot);
		});

		// loading group call
		const dataObjectA2 = await handleA2.get();
		assert.equal(dataObjectA2._root.get("A"), "A", "A should be set");
		assert.equal(dataObjectA2._root.get("B"), "B", "B should be set");

		const groupSnapshot = await snapshotADeferred.promise;
		const snapshotTreeA = groupSnapshot.snapshotTree.trees[".channels"].trees[dataObjectA2.id];
		assertPopulatedGroupIdTree(
			snapshotTreeA,
			groupSnapshot.blobContents,
			"Should be a populated groupId tree",
		);
		assert(
			groupSnapshot.sequenceNumber === summaryRefSeq,
			"failed to load snapshot with correct sequence number",
		);
	});

	it("Load datastore via groupId with snapshot in the future, with seq > some ops", async () => {
		// Load basic container stuff
		const container = await provider.createContainer(runtimeFactory, {
			configProvider: configProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
			}),
		});
		const mainObject = (await container.getEntryPoint()) as TestDataObject;
		const containerRuntime = mainObject.containerRuntime;

		// Create data stores with loadingGroupIds
		const dataStoreA = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);

		// Attach the data stores
		const dataObjectA = (await dataStoreA.entryPoint.get()) as TestDataObject;
		mainObject._root.set("dataObjectA", dataObjectA.handle);
		dataObjectA._root.set("A", "A");

		// Summarize
		await provider.ensureSynchronized();
		const { summarizer, container: summarizingContainer } = await createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactory,
			undefined,
			undefined,
			undefined,
			undefined,
			configProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
			}),
		);
		const { summaryVersion } = await summarizeNow(summarizer);
		// Work around getEntryPoint returning the summarizer instead of a datastore
		const runtimeS = (summarizingContainer as any).runtime as ContainerRuntime;
		const handleS = await runtimeS.getAliasedDataStoreEntryPoint("default");
		assert(handleS !== undefined, "handleS should not be undefined");
		const mainObjectS = (await handleS.get()) as TestDataObject;

		await provider.ensureSynchronized();
		const handleAS = mainObjectS._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		assert(handleAS !== undefined, "handleA2 should not be undefined");
		const dataObjectAS = await handleAS.get();

		clearCacheIfOdsp(provider, persistedCache);

		const container2 = await provider.loadContainer(
			runtimeFactory,
			{
				configProvider: configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
				}),
			},
			{ [LoaderHeader.version]: summaryVersion },
		);
		// Testing the get snapshot call
		const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const handleA2 = mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		assert(handleA2 !== undefined, "handleA2 should not be undefined");

		container2.disconnect();
		const waitForOp = new Deferred<void>();
		dataObjectAS._root.on("valueChanged", (changed) => {
			if (changed.key === "B") {
				waitForOp.resolve();
			}
		});
		dataObjectA._root.set("B", "B");

		await waitForOp.promise;
		await summarizeNow(summarizer);

		// start loading group call
		const dataObjectA2Promise = handleA2.get();
		const deferred = new Deferred<void>();

		void dataObjectA2Promise.then(() => {
			deferred.resolve();
		});

		await delay(100);

		// Loading group call should wait for ops to come through
		assert(!deferred.isCompleted, "Promise should not be resolved yet");

		// This should cause the ops to come through
		container2.connect();
		const dataObjectA2 = await dataObjectA2Promise;

		// Get the latest data
		await provider.ensureSynchronized();
		// Force ops to come through
		assert(deferred.isCompleted, "Promise should be resolved");
		assert(dataObjectA2._root.get("A") === "A", "A should be set");
		assert(dataObjectA2._root.get("B") === "B", "B should be set");
	});

	itExpects(
		"Summarizer load datastore via groupId with snapshot in the future, with seq > some ops",
		[
			{
				eventName: "fluid:telemetry:FluidDataStoreContext:RealizeError",
				error: "Summarizer client behind, loaded newer snapshot with loadingGroupId",
			},
		],
		async () => {
			// Load basic container stuff
			const container = await provider.createContainer(runtimeFactory, {
				configProvider: configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
				}),
			});
			const mainObject = (await container.getEntryPoint()) as TestDataObject;
			const containerRuntime = mainObject.containerRuntime;

			// Create data stores with loadingGroupIds
			const dataStoreA = await containerRuntime.createDataStore(
				testDataObjectType,
				loadingGroupId,
			);

			// Attach the data stores
			const dataObjectA = (await dataStoreA.entryPoint.get()) as TestDataObject;
			mainObject._root.set("dataObjectA", dataObjectA.handle);
			dataObjectA._root.set("A", "A");

			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container,
				dataObjectFactory,
				undefined,
				undefined,
				undefined,
				undefined,
				configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
				}),
			);

			await provider.ensureSynchronized();
			const { summaryVersion } = await summarizeNow(summarizer);
			dataObjectA._root.set("B", "B");
			summarizer.close();

			clearCacheIfOdsp(provider, persistedCache);
			const { summarizer: summarizer1 } = await createSummarizerFromFactory(
				provider,
				container,
				dataObjectFactory,
				summaryVersion,
				undefined,
				undefined,
				undefined,
				configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
				}),
			);

			const { summarizer: summarizer2, container: container2 } =
				await createSummarizerFromFactory(
					provider,
					container,
					dataObjectFactory,
					summaryVersion,
					undefined,
					undefined,
					undefined,
					configProvider({
						"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
					}),
				);
			await provider.ensureSynchronized();
			// Pause the summarizer2 so we can generate a summary in the future
			// Note: The summarizing containers don't get added to the loader container tracker, so we manually pause here
			await container2.deltaManager.inbound.pause();

			// Send an op
			dataObjectA._root.set("C", "C");

			// All this casting is to get the the dataObject from the summarizer2 container to wait for the op we just sent
			const runtime1 = (summarizer1 as any).runtime as ContainerRuntime;
			const mainObjectHandle1 = await runtime1.getAliasedDataStoreEntryPoint("default");
			assert(mainObjectHandle1 !== undefined, "mainObject1 should not be undefined");
			const mainObject1 = (await mainObjectHandle1.get()) as TestDataObject;
			const dataObjectA1Handle = mainObject1._root.get<IFluidHandle>("dataObjectA");
			assert(dataObjectA1Handle !== undefined, "dataObjectA1Handle should not be undefined");
			const dataObjectA1 = (await dataObjectA1Handle.get()) as TestDataObject;

			// Make sure that summarizer1 gets the op
			const waitForOp = new Deferred<void>();
			if (dataObjectA1._root.get("C") === "C") {
				waitForOp.resolve();
			}
			dataObjectA1._root.on("valueChanged", (changed) => {
				if (changed.key === "C") {
					waitForOp.resolve();
				}
			});
			await waitForOp.promise;

			// Generate a summary in the future with summarizer 1
			await summarizeNow(summarizer1);

			// Hack to get the summarizer2 to summarize, there's a bunch of state in the summarizer that prevents us from
			// summarizing, so it's easier to just skip it and call submitSummary directly
			const neverCancel = new Deferred<SummarizerStopReason>();
			const runtime2 = (summarizer2 as any).runtime as ContainerRuntime;
			const result = await runtime2.submitSummary({
				summaryLogger: new MockLogger().toTelemetryLogger(),
				cancellationToken: {
					cancelled: false,
					waitCancelled: neverCancel.promise,
				},
				latestSummaryRefSeqNum: 0,
			});

			assert(result.stage === "base", "submitSummary should fail in base stage");
			assert.equal(
				result.error?.message,
				"Summarizer client behind, loaded newer snapshot with loadingGroupId",
				"submitSummary should fail in base stage because summarizer is behind",
			);
		},
	);

	it("Load datastore via groupId getting a snapshot older than snapshot we loaded from", async () => {
		// Load basic container stuff
		const container = await provider.createContainer(runtimeFactory, {
			configProvider: configProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
			}),
		});
		const mainObject = (await container.getEntryPoint()) as TestDataObject;
		const containerRuntime = mainObject.containerRuntime;

		// Create data store with loadingGroupId
		const dataStoreA = await containerRuntime.createDataStore(
			testDataObjectType,
			loadingGroupId,
		);

		// Attach the data store
		const dataObjectA = (await dataStoreA.entryPoint.get()) as TestDataObject;
		mainObject._root.set("dataObjectA", dataObjectA.handle);
		dataObjectA._root.set("A", "A");

		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactory,
			undefined,
			undefined,
			undefined,
			undefined,
			configProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
			}),
		);

		// Summarize
		await provider.ensureSynchronized();
		const { summaryVersion: summaryVersion1 } = await summarizeNow(summarizer);
		clearCacheIfOdsp(provider, persistedCache);
		const olderSnapshot = await containerRuntime.storage.getSnapshot?.({
			versionId: summaryVersion1,
			loadingGroupIds: [loadingGroupId],
		});
		dataObjectA._root.set("B", "B");

		await provider.ensureSynchronized();
		const { summaryVersion: summaryVersion2 } = await summarizeNow(summarizer);

		clearCacheIfOdsp(provider, persistedCache);
		// Load the container with the second summary
		const container2 = await provider.loadContainer(
			runtimeFactory,
			{
				configProvider: configProvider({
					"Fluid.Container.UseLoadingGroupIdForSnapshotFetch": true,
				}),
			},
			{ [LoaderHeader.version]: summaryVersion2 },
		);
		const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
		const runtime2 = mainObject2.containerRuntime;
		const dataObjectA2Handle =
			mainObject2._root.get<IFluidHandle<TestDataObject>>("dataObjectA");
		assert(dataObjectA2Handle !== undefined, "dataObjectA2Handle should not be undefined");

		assert(runtime2.storage.getSnapshot !== undefined, "getSnapshot not defined for runtime2");
		overrideResult(runtime2.storage, runtime2.storage.getSnapshot, olderSnapshot);
		// TODO: update when this assert changes to a hex.
		await assert.rejects(
			dataObjectA2Handle.get(),
			(error: Error & any) => {
				const correctError: boolean =
					error.errorFromRequestFluidObject === true &&
					error.code === 500 &&
					error.message !== undefined &&
					error.message.includes(
						"Downloaded snapshot older than snapshot we loaded from",
					);

				return correctError;
			},
			"Loading an older snapshot than the snapshot the runtime loaded from should fail",
		);
	});
});
