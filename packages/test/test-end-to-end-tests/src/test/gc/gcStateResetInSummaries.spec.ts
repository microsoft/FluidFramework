/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummarizer } from "@fluidframework/container-runtime";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName, gcTreeKey } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	mockConfigProvider,
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
 * Validates that when GC is disabled on a document that had run GC previously, the GC state is removed from summary
 * and all data stores are marked as referenced. It also tests the reverse scenario where GC is enabled on a document
 * that had GC disabled previously.
 * This validates scenarios where due to some bug the GC state in summary is incorrect and we need to quickly recover
 * documents. Disabling GC will ensure that we are not deleting / marking things unreferenced incorrectly.
 */
describeNoCompat("GC state reset in summaries", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	const settings = {
		"Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs": 10,
	};

	/** Creates a new container with the GC enabled / disabled as per gcAllowed param. */
	const createContainer = async (gcAllowed: boolean): Promise<IContainer> => {
		const testContainerConfig: ITestContainerConfig = {
			...defaultGCConfig,
			runtimeOptions: {
				...defaultGCConfig.runtimeOptions,
				gcOptions: {
					gcAllowed,
				},
			},
			loaderProps: { configProvider: mockConfigProvider(settings) },
		};
		return provider.makeTestContainer(testContainerConfig);
	};

	/**
	 * Generated a summary for the given client and validates the GC state in the summary as per the params:
	 * @param shouldGCRun - Whether GC should run or not. If true, validates that the summary contains a GC tree.
	 * @param shouldRegenerateSummary - Whether the summary should be regenerated. If true, validates that all data
	 * store entries in the summary are of type ISummaryTree.
	 * @param unreferencedDataStoreIds - A list of data store IDs that should be unreferenced in the summary. Validates
	 * that all these data store's summary tree is marked unreferenced. If shouldRunGC is true, also validates that the
	 * GC state for these have an unreferenced timestamp.
	 * @param shouldGCDataBeHandle - True if the GC data in the summary should be a SummaryHandle and not a SummaryTree.
	 *
	 * @returns The summary version of the generated summary.
	 */
	async function summarizeAndValidateGCState(
		summarizer: ISummarizer,
		shouldGCRun: boolean,
		shouldRegenerateSummary: boolean,
		unreferencedDataStoreIds: string[] = [],
		shouldGCDataBeHandle = false,
	) {
		await provider.ensureSynchronized();

		// Submit an on demand summary and validate results.
		const result = summarizer.summarizeOnDemand({ reason: "gcStateResetTest" });
		const submitResult = await result.summarySubmitted;
		assert(submitResult.success, "on-demand summary should submit");
		assert(
			submitResult.data.stage === "submit",
			"on-demand summary submitted data stage should be submit",
		);
		assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

		const broadcastResult = await result.summaryOpBroadcasted;
		assert(broadcastResult.success, "summary op should be broadcast");

		const ackNackResult = await result.receivedSummaryAckOrNack;
		assert(ackNackResult.success, "summary op should be acked");

		await new Promise((resolve) => process.nextTick(resolve));

		const summaryTree = submitResult.data.summaryTree;
		const summaryVersion = ackNackResult.data.summaryAckOp.contents.handle;

		// If shouldRegenerateSummary is true, full tree should have been forced in this summary.
		assert.strictEqual(
			submitResult.data.forcedFullTree,
			shouldRegenerateSummary ? true : false,
			`Full tree ${shouldRegenerateSummary ? "should" : "should not"} have been forced`,
		);

		const channelsTree = (summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
		for (const [id, summaryObject] of Object.entries(channelsTree)) {
			if (summaryObject.type !== SummaryType.Tree) {
				assert(
					!shouldRegenerateSummary,
					`DataStore ${id}'s entry should be a tree if summary was regenerated`,
				);
				continue;
			}

			if (unreferencedDataStoreIds.includes(id)) {
				assert(
					summaryObject.unreferenced === true,
					`DataStore ${id} should be unreferenced`,
				);
			} else {
				assert(summaryObject.unreferenced !== true, `DataStore ${id} should be referenced`);
			}
		}

		if (shouldGCDataBeHandle) {
			const rootGCData = summaryTree.tree[gcTreeKey];
			assert(rootGCData?.type === SummaryType.Handle, `GC data should be a handle`);
		} else {
			const gcState = getGCStateFromSummary(summaryTree);
			if (gcState === undefined) {
				assert(
					!shouldGCRun,
					`If GC tree is not present in summary, GC should not have run.`,
				);
				return;
			}

			for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
				// All nodes belonging to the data store in unreferencedDataStoreIds should have unreferenced timestamp.
				// All other nodes should not have unreferenced timestamp.
				const dsId = nodeId.split("/")[1];
				if (unreferencedDataStoreIds.includes(dsId)) {
					assert(
						nodeData.unreferencedTimestampMs !== undefined,
						`Node ${nodeId} should have unreferenced timestamp`,
					);
				} else {
					assert(
						nodeData.unreferencedTimestampMs === undefined,
						`Node ${nodeId} shouldn't have unreferenced timestamp`,
					);
				}
			}
		}

		return summaryVersion;
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
		// These tests validate the end-to-end behavior of summaries when GC is enabled / disabled. This behavior
		// is not affected by the service. So, it doesn't need to run against real services.
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	it("removes GC state and marks all objects as referenced on disabling GC", async () => {
		// Create a document with GC allowed. It has to be allowed on creation because this setting cannot be changed
		// throughout the lifetime of the document.
		mainContainer = await createContainer(true /* gcAllowed */);
		const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
		await waitForContainerConnection(mainContainer);

		// Create a summarizer with GC enabled as well.
		const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);

		// Create and mark a new data store as referenced by storing its handle in a referenced DDS.
		const newDataStore = await requestFluidObject<ITestDataObject>(
			await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType),
			"",
		);
		mainDataStore._root.set("newDataStore", newDataStore.handle);

		// Mark the data store as unreferenced by deleting its handle from the DDS.
		mainDataStore._root.delete("newDataStore");

		// Validate that GC ran and the unreferenced data store is marked as such in GC state.
		const summaryVersion = await summarizeAndValidateGCState(
			summarizer1,
			true /* shouldGCRun */,
			true /* shouldRegenerateSummary */,
			[newDataStore._context.id],
		);

		// Load a new summarizer from the last summary with GC disabled.
		summarizer1.close();
		const { summarizer: summarizer2 } = await createSummarizer(provider, mainContainer, {
			runtimeOptions: {
				gcOptions: { disableGC: true },
			},
		});

		// Validate that GC does not run and the summary is regenerated because GC was disabled.
		await summarizeAndValidateGCState(
			summarizer2,
			false /* shouldGCRun */,
			true /* shouldRegenerateSummary */,
		);

		// Summarize again and validate that GC does not run and the summary is not regenerated again. The summary is
		// regenerated only the first time GC is disabled after it was enabled before.
		await summarizeAndValidateGCState(
			summarizer2,
			false /* shouldGCRun */,
			false /* shouldRegenerateSummary */,
		);
	});

	it("generates GC state and adds it to summary on enabling GC", async () => {
		// Create a document with GC allowed. It has to be allowed on creation because this setting cannot be changed
		// throughout the lifetime of the document.
		mainContainer = await createContainer(true /* gcAllowed */);
		const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
		await waitForContainerConnection(mainContainer);

		// Create a summarizer with GC disabled.
		const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer, {
			runtimeOptions: { gcOptions: { disableGC: true } },
		});

		// Create and mark a new data store as referenced by storing its handle in a referenced DDS.
		const newDataStore = await requestFluidObject<ITestDataObject>(
			await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType),
			"",
		);
		mainDataStore._root.set("newDataStore", newDataStore.handle);

		// Mark the data store as unreferenced by deleting its handle from the DDS.
		mainDataStore._root.delete("newDataStore");

		// Validate that GC does not run.
		let summaryVersion = await summarizeAndValidateGCState(
			summarizer1,
			false /* shouldGCRun */,
			false /* shouldRegenerateSummary */,
		);

		// Load a new summarizer from the last summary with GC enabled.
		summarizer1.close();
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			undefined,
			summaryVersion,
		);

		// Validate that GC ran and the summary is regenerated with unreferenced data store correctly marked.
		await summarizeAndValidateGCState(
			summarizer2,
			true /* shouldGCRun */,
			true /* shouldRegenerateSummary */,
			[newDataStore._context.id],
		);

		// Summarize again and validate that GC ran and the summary is not regenerated again. The summary is regenerated
		// only the first time GC is enabled after it was disabled before.
		summaryVersion = await summarizeAndValidateGCState(
			summarizer2,
			true /* shouldGCRun */,
			false /* shouldRegenerateSummary */,
			undefined /* unreferencedDataStoreIds */,
			true /* shouldGCDataBeHandle */,
		);

		// Load a new summarizer from the last summary with GC disabled.
		summarizer2.close();
		const { summarizer: summarizer3 } = await createSummarizer(
			provider,
			mainContainer,
			{ runtimeOptions: { gcOptions: { disableGC: true } } },
			summaryVersion,
		);
		// Validate that GC does not run and the summary is regenerated.
		await summarizeAndValidateGCState(
			summarizer3,
			false /* shouldGCRun */,
			true /* shouldRegenerateSummary */,
		);
	});

	/**
	 * This test validates that the GC state is regenerated if needed when state is refreshed from a snapshot. If GC is
	 * enabled and state is refreshed from a snapshot that had GC disabled, the GC state needs to be reset and a full
	 * tree summary should happen.
	 */
	it("regenerates GC state on refreshing from snapshot that has GC disabled", async () => {
		// Create a document with GC allowed. It has to be allowed on creation because this setting cannot be changed
		// throughout the lifetime of the document.
		mainContainer = await createContainer(true /* gcAllowed */);
		const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
		await waitForContainerConnection(mainContainer);

		// Create a data store and mark it as unreferenced by storing and the removing its handle in a referenced DDS.
		const newDataStore = await requestFluidObject<ITestDataObject>(
			await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType),
			"",
		);
		mainDataStore._root.set("newDataStore", newDataStore.handle);
		mainDataStore._root.delete("newDataStore");

		// Create a summarizer with GC enabled and summarize.
		const { summarizer: summarizerGCEnabled } = await createSummarizer(provider, mainContainer);

		// Summarize with GC enabled and validate that GC ran.
		let summaryVersion = await summarizeAndValidateGCState(
			summarizerGCEnabled,
			true /* shouldGCRun */,
			true /* shouldRegenerateSummary */,
			[newDataStore._context.id],
		);

		// Create a summarizer with GC disabled and another one with GC enabled from the above summary where GC was
		// enabled.
		const { container: containerGCDisabled, summarizer: summarizerGCDisabled } =
			await createSummarizer(
				provider,
				mainContainer,
				{
					runtimeOptions: { gcOptions: { disableGC: true } },
					loaderProps: { configProvider: mockConfigProvider(settings) },
				},
				summaryVersion,
			);
		const { container: containerGCEnabled2, summarizer: summarizerGCEnabled2 } =
			await createSummarizer(
				provider,
				mainContainer,
				{
					loaderProps: { configProvider: mockConfigProvider(settings) },
				},
				summaryVersion,
			);

		// Close the previous summarizer such that the summarizer with GC disabled is chosen as the current summarizer.
		summarizerGCEnabled.close();
		await reconnectSummarizerToBeElected(containerGCDisabled);

		// Send an op so the next summary generated is newer than the previous one.
		mainDataStore._root.set("key", "value");

		// Summarize via the summarizer that has GC disabled. Since it loaded from a snapshot that had GC enabled, this
		// should result in summary regeneration.
		summaryVersion = await summarizeAndValidateGCState(
			summarizerGCDisabled,
			false /* shouldGCRun */,
			true /* shouldRegenerateSummary */,
		);

		// Close the previous summarizer such that the summarizer with GC enabled is chosen as the current summarizer.
		summarizerGCDisabled.close();
		await reconnectSummarizerToBeElected(containerGCEnabled2);

		// Now, this summarizer has GC enabled and was loaded from a snapshot that had GC enabled. So, summary need not
		// be regenerated from that point. However, it will receive an ack for the summary from the summarizer with GC
		// disabled and it will close.
		await summarizerGCEnabled2.summarizeOnDemand({ reason: "gcStateResetTest" })
			.summarySubmitted;

		assert(
			containerGCEnabled2.disposed === true,
			"Container disposed when loaded from an older summary",
		);
	});

	it("keeps GC enabled throughout the lifetime of a document", async () => {
		// Create a document with GC allowed.
		mainContainer = await createContainer(true /* gcAllowed */);
		const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
		await waitForContainerConnection(mainContainer);

		// Create a summarizer with GC disabled.
		const { summarizer } = await createSummarizer(provider, mainContainer, {
			runtimeOptions: { gcOptions: { gcAllowed: false } },
		});

		// Create and mark a new data store as referenced by storing its handle in a referenced DDS.
		const newDataStore = await requestFluidObject<ITestDataObject>(
			await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType),
			"",
		);
		mainDataStore._root.set("newDataStore", newDataStore.handle);

		// Validate that GC ran even though gcAllowed was set to false. Whether GC runs or not is determined by the
		// gcAllowed flag when the document was created.
		await summarizeAndValidateGCState(
			summarizer,
			true /* shouldGCRun */,
			true /* shouldRegenerateSummary */,
		);
	});

	it("keeps GC disabled throughout the lifetime of a document", async () => {
		// Create a document with GC not allowed.
		mainContainer = await createContainer(false /* gcAllowed */);
		const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
		await waitForContainerConnection(mainContainer);

		// Get a new summarizer that sets gcAllowed option to true.
		const { summarizer } = await createSummarizer(provider, mainContainer, {
			runtimeOptions: { gcOptions: { gcAllowed: true } },
		});

		// Create and mark a new data store as referenced by storing its handle in a referenced DDS.
		const newDataStore = await requestFluidObject<ITestDataObject>(
			await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType),
			"",
		);
		mainDataStore._root.set("newDataStore", newDataStore.handle);

		// Validate that GC did not run even though gcAllowed is set to true. Whether GC runs or not is determined by
		// the gcAllowed flag when the document was created.
		await summarizeAndValidateGCState(
			summarizer,
			false /* shouldGCRun */,
			false /* shouldRegenerateSummary */,
		);
	});
});
