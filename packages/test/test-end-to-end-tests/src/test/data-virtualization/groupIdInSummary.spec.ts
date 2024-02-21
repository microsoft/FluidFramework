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
import { type IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
	createSummarizerFromFactory,
	summarizeNow,
	type ITestObjectProvider,
} from "@fluidframework/test-utils";
import { SummaryType } from "@fluidframework/protocol-definitions";
import { LoaderHeader } from "@fluidframework/container-definitions";

// A Test Data Object that exposes some basic functionality.
class TestDataObject extends DataObject {
	public get _root() {
		return this.root;
	}

	public get containerRuntime() {
		return this.context.containerRuntime;
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
		const dataObject = (await dataStore.entryPoint.get()) as TestDataObject;
		const dataObject2 = (await dataStore2.entryPoint.get()) as TestDataObject;
		mainObject._root.set("dataObject", dataObject.handle);
		mainObject._root.set("dataObject2", dataObject2.handle);
		mainObject._root.delete("dataObject2");

		await provider.ensureSynchronized();
		const { summarizer } = await createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactory,
		);
		const { summaryVersion, summaryTree } = await summarizeNow(summarizer);
		const channelsTree = summaryTree.tree[".channels"];
		assert(channelsTree.type === SummaryType.Tree, "channels should be a tree");
		const dataObjectTree = channelsTree.tree[dataObject.id];
		assert(dataObjectTree !== undefined, "dataObjectTree should exist");
		assert(dataObjectTree.type === SummaryType.Tree, "dataObjectTree should be a tree");
		assert(dataObjectTree.groupId === loadingGroupId, "GroupId should be on the summary tree");

		// TODO: Enable this portion in tinylicious
		if (provider.driver.type === "local") {
			const container2 = await provider.loadContainer(runtimeFactory, undefined, {
				[LoaderHeader.version]: summaryVersion,
			});

			const mainObject2 = (await container2.getEntryPoint()) as TestDataObject;
			const handle2 = await mainObject2._root.get("dataObject");
			assert(handle2 !== undefined, "handle2 should not be undefined");
			const testObject2 = (await handle2.get()) as TestDataObject;
			assert.equal(testObject2.loadingGroupId, loadingGroupId, "groupId should be the same");
		}
	});
});
