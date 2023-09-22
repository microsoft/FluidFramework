/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	createSummarizer,
	ITestContainerConfig,
	ITestObjectProvider,
	mockConfigProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	describeNoCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-internal/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * Validates that that reference state of nodes is correct irrespective of whether a summarizer loads from the latest
 * summary or an older summary. When a summarizer loads from an older summary, it gets the ack for newer summaries and
 * refreshes its state from the newer summary. These tests validates that the GC state is correctly refreshed.
 */
describeNoCompat("GC loading from older summaries", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let containerRuntime: IContainerRuntime;
	let dataStoreA: ITestDataObject;

	const settings = {
		"Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs": 10,
	};
	const testConfig: ITestContainerConfig = {
		...defaultGCConfig,
		loaderProps: { configProvider: mockConfigProvider(settings) },
	};

	/**
	 * Returns the reference state for all the nodes in the given summary tree.
	 * If a node is referenced, its value is true. If it's unreferenced, its value is false.
	 * @returns a map of nodePath to its unreferenced timestamp.
	 */
	async function getReferenceState(summaryTree: ISummaryTree) {
		const gcState = getGCStateFromSummary(summaryTree);
		assert(gcState !== undefined, "GC tree is not available in the summary");

		const nodeIsReferencedMap: Map<string, boolean> = new Map();
		for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
			nodeIsReferencedMap.set(
				nodePath.slice(1),
				nodeData.unreferencedTimestampMs === undefined ? true : false,
			);
		}
		return nodeIsReferencedMap;
	}

	/**
	 * Reconnects the summarizer so that it is elected as the current summarizer. This is needed for two reasons:
	 * 1. In ODSP, when a summary is submitted, the previous one may be deleted based on heuristics. Since these tests
	 * need to load a container from an older summary, we need to load a summarizer with the old summary before a new
	 * one is generated. This poses problem with summarizer election because of the second reason below.
	 * 2. In these tests, summarization is disabled on the main container. However, when the first summarizer container
	 * is closed, the main container is still chosen as the summarizer due to a bug. If we reconnect a new summarizer
	 * after this happens, it will be chosen as the summarizer client and can do on-demand summaries.
	 */
	async function reconnectSummarizerToBeElected(container: IContainer) {
		container.disconnect();
		container.connect();
		await waitForContainerConnection(container);
	}

	beforeEach(async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		mainContainer = await provider.makeTestContainer(testConfig);
		const defaultDataStore = await requestFluidObject<ITestDataObject>(
			mainContainer,
			"default",
		);
		containerRuntime = defaultDataStore._context.containerRuntime as IContainerRuntime;

		// Create data store B and mark it referenced. This will be used to manage reference of another data store.
		// We create a new data store because the default data store and is always realized by the test infrastructure.
		// In these tests, the data store managing referencing should not be realized by default.
		const dataStoreAHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandle<ITestDataObject>;
		assert(dataStoreAHandle !== undefined, "data store does not have a handle");
		dataStoreA = await dataStoreAHandle.get();
		defaultDataStore._root.set("dataStoreA", dataStoreAHandle);

		await provider.ensureSynchronized();
		await waitForContainerConnection(mainContainer);
	});

	it("closes the summarizer when loading from an older summary", async () => {
		const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);

		// Create a data store and mark it unreferenced to begin with.
		const dataStoreBHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandle<ITestDataObject>;
		assert(dataStoreBHandle !== undefined, "New data store does not have a handle");
		const dataStoreB = await dataStoreBHandle.get();
		dataStoreA._root.set("dataStoreB", dataStoreBHandle);
		dataStoreA._root.delete("dataStoreB");

		await provider.ensureSynchronized();

		// Summarize - summary1. dataStoreB should be unreferenced.
		const summaryResult1 = await summarizeNow(summarizer1);
		const referenceState1 = await getReferenceState(summaryResult1.summaryTree);
		const dsAReferenceState1 = referenceState1.get(dataStoreA._context.id);
		assert(dsAReferenceState1 === true, `dataStoreA should be referenced`);
		const dsBReferenceState1 = referenceState1.get(dataStoreB._context.id);
		assert(dsBReferenceState1 === false, `dataStoreB should be unreferenced`);

		// Create a second summarizer with summary1. Note that this is done before posting another summary because ODSP
		// may delete this summary when a new one is posted.
		const { container: container2, summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			{ loaderProps: { configProvider: mockConfigProvider(settings) } },
			summaryResult1.summaryVersion,
		);

		// Reference dataStoreB now.
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);

		// Summarize - summary2. dataStoreB should now be referenced.
		await provider.ensureSynchronized();
		const summaryResult2 = await summarizeNow(summarizer1);
		const referenceState2 = await getReferenceState(summaryResult2.summaryTree);
		const dsAReferenceState2 = referenceState2.get(dataStoreA._context.id);
		assert(dsAReferenceState2 === true, `dataStoreA should still be referenced (1)`);
		const dsBReferenceState2 = referenceState2.get(dataStoreB._context.id);
		assert(dsBReferenceState2 === true, `dataStoreB should be referenced now`);

		// Close the first summarizer and reconnect the second one. The reconnection is necessary so that it is elected
		// as the new summarizer.
		summarizer1.close();
		await reconnectSummarizerToBeElected(container2);

		// Create a new alias data store so that the GC data changes without changing the GC state of existing data
		// stores. This is to write the GC tree in summary (instead of handle) which is used for validation.
		const ds2 = await containerRuntime.createDataStore(TestDataObjectType);
		const aliasResult = await ds2.trySetAlias("root2");
		assert.strictEqual(aliasResult, "Success", "Failed to alias data store");
		await provider.ensureSynchronized();

		// Summarize - summary3 with the new summarizer. Before it summarizes, it will catch up to latest and so the
		// reference state of the data stores should be the same as in summary2.
		// Also, note that while catching up, it will download summary2 and update state from it.
		await summarizer2.summarizeOnDemand({ reason: "test" }).summarySubmitted;
		assert(
			container2.disposed === true,
			"Container should be closed after summarizing as it loaded from an older summary",
		);
	});
});
