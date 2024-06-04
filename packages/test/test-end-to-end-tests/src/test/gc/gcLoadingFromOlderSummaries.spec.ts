/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
	itExpects,
} from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
	timeoutPromise,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * Validates that when a summarizer loads from an older summary and gets an ack for a newer summary, it disposes
 * rather than trying to update its state from the new summary.
 */
describeCompat("GC loading from older summaries", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let containerRuntime: IContainerRuntime;
	let dataStoreA: ITestDataObject;

	const configProvider = createTestConfigProvider();
	configProvider.set("Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs", 10);
	configProvider.set("Fluid.ContainerRuntime.SubmitSummary.shouldValidatePreSummaryState", false);
	const testConfig: ITestContainerConfig = {
		...defaultGCConfig,
		loaderProps: { configProvider },
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

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		mainContainer = await provider.makeTestContainer(testConfig);
		const defaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
		containerRuntime = defaultDataStore._context.containerRuntime as IContainerRuntime;

		// Create data store B and mark it referenced. This will be used to manage reference of another data store.
		// We create a new data store because the default data store and is always realized by the test infrastructure.
		// In these tests, the data store managing referencing should not be realized by default.
		const dataStoreAHandle = (await containerRuntime.createDataStore(TestDataObjectType))
			.entryPoint as IFluidHandleInternal<ITestDataObject>;
		assert(dataStoreAHandle !== undefined, "data store does not have a handle");
		dataStoreA = await dataStoreAHandle.get();
		defaultDataStore._root.set("dataStoreA", dataStoreAHandle);

		await provider.ensureSynchronized();
		await waitForContainerConnection(mainContainer);
	});

	itExpects(
		"disposes the summarizer when loading from an older summary",
		[
			{ eventName: "fluid:telemetry:Summarizer:Running:LatestSummaryRefSeqNumMismatch" },
			{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" },
		],
		async () => {
			const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);

			// Create a data store and mark it unreferenced to begin with.
			const dataStoreBHandle = (await containerRuntime.createDataStore(TestDataObjectType))
				.entryPoint as IFluidHandleInternal<ITestDataObject>;
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

			// Create a second summarizer with summary1. Note that this is done before posting another summary because
			// the server may delete this summary when a new one is posted.
			const { container: container2, summarizer: summarizer2 } = await createSummarizer(
				provider,
				mainContainer,
				{ loaderProps: { configProvider } },
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

			// Call summarizeOnDemand. This will trigger the logic that processes summary ack. The ack from the last
			// summary will cause summarizer2 to dispose because it sees a new ack that is generated by another summarizer.
			await provider.ensureSynchronized();
			await summarizer2.summarizeOnDemand({ reason: "test" }).summarySubmitted;

			// Wait for the container for the above summarizer to be disposed.
			await timeoutPromise((resolve) => {
				if (container2.disposed) {
					resolve();
					return;
				}
				container2.on("disposed", () => resolve());
			});
			assert(
				container2.disposed === true,
				"Container should be closed after summarizing as it loaded from an older summary",
			);
		},
	);
});
