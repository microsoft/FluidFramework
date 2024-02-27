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
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils";
import type { ISnapshot } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { LoaderHeader } from "@fluidframework/container-definitions";

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
	const configProvider = createTestConfigProvider();
	configProvider.set("Fluid.Container.UseLoadingGroupIdForSnapshotFetch", true);

	const testDataObjectType = "TestDataObject";
	const dataObjectFactory = new DataObjectFactory(testDataObjectType, TestDataObject, [], {});

	// The 1st runtime factory, V1 of the code
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory,
		registryEntries: [dataObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

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
	it("Load datastore via groupId with snapshot in the future, with seq < all the ops", async () => {
		if (provider.driver.type !== "local") {
			return;
		}
		// Load basic container stuff
		const container = await provider.createContainer(runtimeFactory, { configProvider });
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
		);
		const { summaryVersion } = await summarizeNow(summarizer);

		const container2 = await provider.loadContainer(
			runtimeFactory,
			{ configProvider },
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

		const groupSnapshot = await snapshotADeferred.promise;
		const snapshotTreeA = groupSnapshot.snapshotTree.trees[".channels"].trees[dataObjectA2.id];
		assertPopulatedGroupIdTree(snapshotTreeA, "Should be a populated groupId tree");
		assert(
			groupSnapshot.sequenceNumber === summaryRefSeq,
			"failed to load snapshot with correct sequence number",
		);
	});
});
