/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	describeCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import {
	IContainer,
	LoaderHeader,
	DisconnectReason,
} from "@fluidframework/container-definitions/internal";
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import type {
	ISnapshot,
	ISnapshotTree,
	SummaryObject,
} from "@fluidframework/driver-definitions/internal";
import {
	createSummarizer,
	ITestContainerConfig,
	ITestObjectProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { TestPersistedCache } from "../../testPersistedCache.js";
import { supportsDataVirtualization, clearCacheIfOdsp } from "../data-virtualization/index.js";

import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

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

/**
 * Validates that an unreferenced datastore goes through all the GC phases without overlapping.
 */
describeCompat("GC & Data Virtualization", "NoCompat", (getTestObjectProvider) => {
	const configProviderObject = configProvider({
		"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": true,
	});
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
		},
		loaderProps: {
			configProvider: configProviderObject,
		},
	};

	let provider: ITestObjectProvider;
	const persistedCache = new TestPersistedCache();

	const loadSummarizer = async (container: IContainer, summaryVersion?: string) => {
		return createSummarizer(
			provider,
			container,
			{
				loaderProps: {
					configProvider: configProviderObject,
				},
			},
			summaryVersion,
		);
	};

	function getDataStoreInSummaryTree(summaryTree: ISummaryTree, dataStoreId: string) {
		const channelsTree: SummaryObject | undefined = summaryTree.tree[".channels"];
		assert(channelsTree !== undefined, "Expected a .channels tree");
		assert(channelsTree.type === SummaryType.Tree, "Expected a tree");
		return channelsTree.tree?.[dataStoreId];
	}

	async function isDataStoreInSummaryTree(summaryTree: ISummaryTree, dataStoreId: string) {
		return getDataStoreInSummaryTree(summaryTree, dataStoreId) !== undefined;
	}

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true, persistedCache });

		if (!supportsDataVirtualization(provider)) {
			this.skip();
		}
	});

	afterEach(async () => {
		persistedCache.reset();
	});

	it("Virtualized datastore has same gc state even when not downloaded", async () => {
		// Intercept snapshot call so we can get call count and the snapshot
		let snapshotCaptured: ISnapshot | undefined;
		let callCount = 0;
		const documentServiceFactory = provider.documentServiceFactory;
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

		// create container and summarizer
		const mainContainer = await provider.makeTestContainer(testContainerConfig);
		const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
		await waitForContainerConnection(mainContainer);
		callCount = 0;
		const { container, summarizer } = await loadSummarizer(mainContainer);
		assert(callCount === 1, "Expected one snapshot call");

		// create datastore A and B
		const dataStoreA = await mainDataStore._context.containerRuntime.createDataStore(
			TestDataObjectType,
			"group",
		);
		const dataStoreB =
			await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType);

		const handleA = dataStoreA.entryPoint;
		const handleB = dataStoreB.entryPoint;
		assert(handleA !== undefined, "Expected a handle when creating a datastoreA");
		assert(handleB !== undefined, "Expected a handle when creating a datastoreB");
		const dataObjectA = (await handleA.get()) as ITestDataObject;
		const dataStoreId = dataObjectA._context.id;

		// reference datastore A and B
		mainDataStore._root.set("dataStoreA", handleA);
		mainDataStore._root.set("dataStoreB", handleB);

		// unreference datastore A
		mainDataStore._root.delete("dataStoreA");

		// Summarize and verify datastore A is unreferenced
		await provider.ensureSynchronized();
		callCount = 0;
		clearCacheIfOdsp(provider, persistedCache);
		const { summaryTree, summaryVersion } = await summarizeNow(summarizer);

		// Validate GC state datastoreA should be unreferenced
		assert(callCount === 0, "Expected no snapshot call");
		const gcState = getGCStateFromSummary(summaryTree);
		assert(gcState !== undefined, "Expected GC state to be generated");
		const gcNodeA = gcState.gcNodes?.[handleA.absolutePath];
		assert(gcNodeA !== undefined, "Data Store should exist on gc graph");
		const unreferencedTimestampMs = gcNodeA.unreferencedTimestampMs;
		assert(unreferencedTimestampMs !== undefined, "Data Store should be unreferenced");
		// DataStoreA should be in the summary
		assert(
			isDataStoreInSummaryTree(summaryTree, dataStoreId),
			"Data Store should be in the summary!",
		);

		// Load new container
		clearCacheIfOdsp(provider, persistedCache);
		const mainContainer2 = await provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
		const mainDataStore2 = (await mainContainer2.getEntryPoint()) as ITestDataObject;

		// Close the old summarizer and container so that we can summarize th new container.
		summarizer.close();
		container.close(DisconnectReason.Expected);
		mainContainer.close(DisconnectReason.Expected);

		// Unreference datastore B
		mainDataStore2._root.delete("dataStoreB");

		// Load new summarizer
		snapshotCaptured = undefined;
		callCount = 0;
		const { summarizer: summarizer2 } = await loadSummarizer(mainContainer2, summaryVersion);
		assert(callCount === 1, "Expected one snapshot call");
		assert(snapshotCaptured !== undefined, "Expected snapshot to be captured");

		// Validate that we loaded the snapshot without datastoreA on the snapshot
		const tree = (snapshotCaptured as ISnapshot).snapshotTree.trees[".channels"]?.trees;
		const datastoreATree: ISnapshotTree | undefined = tree[dataStoreId];
		assert(datastoreATree !== undefined, "DataStoreA should be in the snapshot");

		// Summarize and verify datastoreA is still unreferenced
		await provider.ensureSynchronized();
		callCount = 0;
		const { summaryTree: summaryTree2 } = await summarizeNow(summarizer2);

		// Validate GC state (dataStoreA should be unreferenced with the same timestamp as the previous summary)
		assert(callCount === 0, "Expected no snapshot call");
		const gcState2 = getGCStateFromSummary(summaryTree2);
		assert(gcState2 !== undefined, "Expected GC state to be generated");
		const gcNodeA2 = gcState2.gcNodes?.[handleA.absolutePath];
		assert(gcNodeA2 !== undefined, "DataStoreA should exist on gc graph");
		assert(
			gcNodeA2.unreferencedTimestampMs === unreferencedTimestampMs,
			"DataStoreA should be unreferenced the same",
		);
		// Validate summary state (dataStoreA should be a summary handle)
		const dataStoreTreeA = getDataStoreInSummaryTree(summaryTree2, dataStoreId);
		assert(dataStoreTreeA?.type === SummaryType.Handle, "DataStoreA should not have changed!");
	});
});
