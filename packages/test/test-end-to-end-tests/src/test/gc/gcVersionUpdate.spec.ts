/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, ISummarizer } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName, gcTreeKey } from "@fluidframework/runtime-definitions";
import {
	ITestFluidObject,
	ITestObjectProvider,
	TestFluidObjectFactory,
	createSummarizerFromFactory,
	createContainerRuntimeFactoryWithDefaultDataStore,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	IGCMetadata,
	IGarbageCollector,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/dist/gc/index.js";

// IContainerRuntime type that exposes garbage collector which is a private property.
type IContainerRuntimeWithPrivates = IContainerRuntime & {
	readonly garbageCollector: IGarbageCollector;
};

/**
 * Validates that when the runtime GC version changes, we reset GC state and regenerate summary. Basically, when we
 * update the GC version due to bugs, newer versions re-run GC and older versions stop running GC.
 */
describeCompat("GC version update", "NoCompat", (getTestObjectProvider, apis) => {
	const {
		containerRuntime: { ContainerRuntimeFactoryWithDefaultDataStore },
	} = apis;
	let provider: ITestObjectProvider;
	// TODO:#4670: Make this compat-version-specific.
	const defaultFactory = new TestFluidObjectFactory([]);
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
		gcOptions: { gcAllowed: true },
	};

	const defaultRuntimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
		ContainerRuntimeFactoryWithDefaultDataStore,
		{
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			runtimeOptions,
		},
	);

	let mainContainer: IContainer;
	let dataStore1Id: string;
	let dataStore2Id: string;
	let dataStore3Id: string;

	/**
	 * Generates a summary and validates that the data store's summary is of correct type - tree or handle.
	 * The data stores ids in dataStoresAsHandles should have their summary as handles. All other data stores
	 * should have their summary as tree.
	 */
	async function summarizeAndValidateDataStoreState(
		summarizer: ISummarizer,
		dataStoresAsHandles: string[],
		gcEnabled: boolean,
	) {
		await provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);

		const gcTreeExists = summaryResult.summaryTree.tree[gcTreeKey] !== undefined;
		assert.strictEqual(gcTreeExists, gcEnabled, "GC tree in summary is not as expected.");

		const dataStoreTrees = (summaryResult.summaryTree.tree[channelsTreeName] as ISummaryTree)
			.tree;
		for (const [key, value] of Object.entries(dataStoreTrees)) {
			if (dataStoresAsHandles.includes(key)) {
				assert(
					value.type === SummaryType.Handle,
					`The summary for data store ${key} should be a handle`,
				);
			} else {
				assert(
					value.type === SummaryType.Tree,
					`The summary for data store ${key} should be a tree`,
				);
			}
		}
		return summaryResult.summaryVersion;
	}

	/**
	 * Function that sets up a container such that the GC version is the metadata blob in summary is updated as per
	 * gcVersionDiff param. It either increments or decrements the version to provide the ability to test clients
	 * running different GC versions.
	 */
	async function setupGCVersionUpdateInMetadata(container: IContainer, gcVersionDiff: number) {
		const summarizer = await container.getEntryPoint();

		// Override the getMetadata function in GarbageCollector to update the gcFeature property.
		const containerRuntime = (summarizer as any).runtime as IContainerRuntimeWithPrivates;
		let getMetadataFunc = containerRuntime.garbageCollector.getMetadata;
		const getMetadataOverride = () => {
			getMetadataFunc = getMetadataFunc.bind(containerRuntime.garbageCollector);
			const metadata = getMetadataFunc();
			const gcFeature = metadata.gcFeature;
			assert(gcFeature !== undefined, "gcFeature not found in GC metadata");
			const updatedMetadata: IGCMetadata = {
				...metadata,
				gcFeature: gcFeature + gcVersionDiff,
			};
			return updatedMetadata;
		};
		containerRuntime.garbageCollector.getMetadata = getMetadataOverride;
	}

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
		mainContainer = await provider.createContainer(defaultRuntimeFactory);
		const dataStore1 = (await mainContainer.getEntryPoint()) as ITestFluidObject;
		dataStore1Id = dataStore1.context.id;

		// Create couple more data stores and mark them as referenced.
		const containerRuntime = dataStore1.context.containerRuntime;
		const dataStore2 = (await (
			await containerRuntime.createDataStore(defaultFactory.type)
		).entryPoint.get()) as ITestFluidObject;
		dataStore1.root.set("dataStore2", dataStore2.handle);
		const dataStore3 = (await (
			await containerRuntime.createDataStore(defaultFactory.type)
		).entryPoint.get()) as ITestFluidObject;
		dataStore1.root.set("dataStore3", dataStore3.handle);
		dataStore2Id = dataStore2.context.id;
		dataStore3Id = dataStore3.context.id;

		await waitForContainerConnection(mainContainer);
	});

	it("should regenerate summary and GC data when GC version is newer that the one in base snapshot", async () => {
		// Stores the ids of data stores whose summary tree should be handles.
		let dataStoresAsHandles: string[] = [];

		// Create a summarizer client.
		const { summarizer: summarizer1, container: container1 } =
			await createSummarizerFromFactory(provider, mainContainer, defaultFactory);
		// Setup the summarizer container's GC version in summary to be decremented by 1. Containers that load from
		// this summary will have newer GC version.
		await setupGCVersionUpdateInMetadata(container1, -1 /* gcVersionDiff */);

		// Generate a summary and validate that all data store summaries are trees.
		await summarizeAndValidateDataStoreState(
			summarizer1,
			dataStoresAsHandles,
			true /* gcEnabled */,
		);

		// Generate another summary in which the summaries for all data stores are handles.
		dataStoresAsHandles.push(dataStore1Id, dataStore2Id, dataStore3Id);
		const summaryVersion = await summarizeAndValidateDataStoreState(
			summarizer1,
			dataStoresAsHandles,
			true /* gcEnabled */,
		);

		// Create a new summarizer. It will have newer GC version that the above container.
		summarizer1.close();
		const { summarizer: summarizer2 } = await createSummarizerFromFactory(
			provider,
			mainContainer,
			defaultFactory,
			summaryVersion,
		);

		// Validate that there aren't any handles in the summary generated by the new mainContainer runtime since the
		// GC version got updated.
		dataStoresAsHandles = [];
		await summarizeAndValidateDataStoreState(
			summarizer2,
			dataStoresAsHandles,
			true /* gcEnabled */,
		);
	});

	it("should disable GC and regenerate state when GC version is older than the one in base snapshot", async () => {
		// Stores the ids of data stores whose summary tree should be handles.
		let dataStoresAsHandles: string[] = [];

		// Create a summarizer client.
		const { summarizer: summarizer1, container: container1 } =
			await createSummarizerFromFactory(provider, mainContainer, defaultFactory);
		// Setup the summarizer container's GC version in summary to be incremented by 1. Containers that load from
		// this summary will have older GC version.
		await setupGCVersionUpdateInMetadata(container1, 1 /* gcVersionDiff */);

		// Generate a summary and validate that all data store summaries are trees.
		await summarizeAndValidateDataStoreState(
			summarizer1,
			dataStoresAsHandles,
			true /* gcEnabled */,
		);

		// Generate another summary in which the summaries for all data stores are handles.
		dataStoresAsHandles.push(dataStore1Id, dataStore2Id, dataStore3Id);
		const summaryVersion = await summarizeAndValidateDataStoreState(
			summarizer1,
			dataStoresAsHandles,
			true /* gcEnabled */,
		);

		// Create a new summarizer. It will have older GC version that the above container.
		summarizer1.close();
		const { summarizer: summarizer2 } = await createSummarizerFromFactory(
			provider,
			mainContainer,
			defaultFactory,
			summaryVersion,
		);

		// Validate that there aren't any handles in the summary generated by the new mainContainer runtime since the
		// GC version got updated.
		// Also, GC should not have run since this summarizer's GC version is older than the one it loaded from.
		dataStoresAsHandles = [];
		await summarizeAndValidateDataStoreState(
			summarizer2,
			dataStoresAsHandles,
			false /* gcEnabled */,
		);
	});
});
