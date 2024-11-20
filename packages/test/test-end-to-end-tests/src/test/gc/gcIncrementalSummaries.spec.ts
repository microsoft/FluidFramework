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
import { ContainerRuntime, ISummarizer } from "@fluidframework/container-runtime/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { defaultGCConfig } from "./gcTestConfigs.js";

/**
 * Validates that unchanged Fluid objects are not summarized again. Basically, only objects that have changed since
 * the previous summary should be summarized and for the rest, we add handles that refer to the previous summary.
 * A Fluid object is considered changed since the last summary if either or both of the following is true:
 * - It received an op.
 * - Its reference state changed, i.e., it was referenced and became unreferenced or vice-versa.
 */
describeCompat("GC incremental summaries", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let dataStoreA: ITestDataObject;

	/**
	 * Submits a summary and validates that the data stores with ids in `changedDataStoreIds` are summarized. All
	 * other data stores are not summarized and a handle is sent for them in the summary.
	 */
	async function validateIncrementalSummary(
		summarizer: ISummarizer,
		dataStoreSummaryTypes: Map<string, SummaryType>,
	) {
		await provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		const channelsTree = (summaryResult.summaryTree.tree[channelsTreeName] as ISummaryTree)
			.tree;
		for (const [id, summaryObject] of Object.entries(channelsTree)) {
			const summaryType = dataStoreSummaryTypes.get(id);
			if (summaryType !== undefined) {
				assert(
					summaryObject.type === summaryType,
					`Data store ${id}'s entry should be ${summaryType}`,
				);
			}
		}
		return summaryResult.summaryVersion;
	}

	beforeEach("setup", async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
		mainContainer = await provider.makeTestContainer(defaultGCConfig);
		dataStoreA = (await mainContainer.getEntryPoint()) as ITestDataObject;
		await waitForContainerConnection(mainContainer);
	});

	beforeEach("skip-r11s", async function () {
		// Skip these tests for standalone r11s.  Summaries can take upwards of 20 seconds which times out the test.
		// These tests are covering client logic and the coverage from other drivers/endpoints is sufficient.
		if (provider.driver.type === "r11s" && provider.driver.endpointName !== "frs") {
			this.skip();
		}
	});

	async function createNewDataStore() {
		const newDataStore =
			await dataStoreA._context.containerRuntime.createDataStore(TestDataObjectType);
		return (await newDataStore.entryPoint.get()) as ITestDataObject;
	}

	it("only summarizes changed data stores", async () => {
		const dataStoreSummaryTypesMap: Map<string, SummaryType> = new Map();
		const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);

		// Create data stores B and C, and mark them as referenced.
		const dataStoreB = await createNewDataStore();
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);
		const dataStoreC = await createNewDataStore();
		dataStoreA._root.set("dataStoreC", dataStoreC.handle);

		// Summarize and validate that all data store entries are trees since this is the first summary.
		dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Tree);
		dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Tree);
		dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Tree);
		await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);

		// Make a change in dataStoreA.
		dataStoreA._root.set("key", "value");

		// Summarize and validate that dataStoreA's entry is a tree and rest of the data store entries are handles.
		dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Handle);
		dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Handle);
		await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);

		// Summarize again and validate that all data store entries are handles since none of them changed.
		dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Handle);
		await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);
	});

	it("only summarizes changed data stores across multiple summarizer clients", async () => {
		const dataStoreSummaryTypesMap: Map<string, SummaryType> = new Map();
		const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);

		// Create data stores B and C, and mark them as referenced.
		const dataStoreB = await createNewDataStore();
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);
		const dataStoreC = await createNewDataStore();
		dataStoreA._root.set("dataStoreC", dataStoreC.handle);

		// Validate that all data store entries are trees since this is the first summary.
		// Summarize and validate that all data store entries are trees since this is the first summary.
		dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Tree);
		dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Tree);
		dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Tree);
		let summaryVersion = await validateIncrementalSummary(
			summarizer1,
			dataStoreSummaryTypesMap,
		);

		// Close existing summarizer and load a new summarizer from the summary generated above.
		summarizer1.close();
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			undefined,
			summaryVersion,
		);

		// Summarize the new client and validate that all data store entries are handles since none of them changed.
		dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Handle);
		dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Handle);
		dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Handle);
		summaryVersion = await validateIncrementalSummary(summarizer2, dataStoreSummaryTypesMap);

		// Make a change in dataStoreA.
		dataStoreA._root.set("key", "value");

		// Close existing summarizer and load a new summarizer from the summary generated above.
		summarizer2.close();
		const { summarizer: summarizer3 } = await createSummarizer(
			provider,
			mainContainer,
			undefined,
			summaryVersion,
		);

		// Summarize the new client and validate that dataStoreA's entry is a tree and rest of the data store
		// entries are handles.
		dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Tree);
		await validateIncrementalSummary(summarizer3, dataStoreSummaryTypesMap);
	});

	it("summarizes data stores whose reference state changed across summarizer clients", async () => {
		const dataStoreSummaryTypesMap: Map<string, SummaryType> = new Map();
		const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);

		// Create data stores B and C, and mark them as referenced.
		const dataStoreB = await createNewDataStore();
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);
		const dataStoreC = await createNewDataStore();
		dataStoreA._root.set("dataStoreC", dataStoreC.handle);

		// Summarize and validate that all data store entries are trees since this is the first summary.
		dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Tree);
		dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Tree);
		dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Tree);
		await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);

		// Remove the reference to dataStoreB.
		dataStoreA._root.delete("dataStoreB");

		// Summarize and validate that both dataStoreA and dataStoreB are trees. dataStoreA because it has a new
		// op and dataStoreB because its reference state changed from referenced -> unreferenced.
		dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Handle);
		let summaryVersion = await validateIncrementalSummary(
			summarizer1,
			dataStoreSummaryTypesMap,
		);

		// Close existing summarizer and load a new summarizer from the summary generated above.
		summarizer1.close();
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			mainContainer,
			undefined,
			summaryVersion,
		);

		// Add back the reference to dataStoreB.
		dataStoreA._root.set("dataStoreB", dataStoreB.handle);

		// Summarize the new client and validate that both dataStoreA and dataStoreB are trees. dataStoreA because it
		// has a new op and dataStoreB because its reference state changed from unreferenced -> referenced.
		summaryVersion = await validateIncrementalSummary(summarizer2, dataStoreSummaryTypesMap);

		// Close existing summarizer and load a new summarizer from the summary generated above.
		summarizer2.close();
		const { summarizer: summarizer3 } = await createSummarizer(
			provider,
			mainContainer,
			undefined,
			summaryVersion,
		);

		// Validate that all data store entries are handles since none of them changed.
		dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Handle);
		dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Handle);
		await validateIncrementalSummary(summarizer3, dataStoreSummaryTypesMap);
	});

	/**
	 * When a data store's GC state changes (referenced -\> unreferenced or vice-versa), it is summarized. This
	 * test validates that when there are GC state updated data stores in a summary and that summary fails,
	 * incrementalSummaryViolation is not logged in the next successful summary.
	 */
	itExpects(
		"does not log incrementalSummaryViolation when summary fails with gc state updated data stores",
		[
			{
				eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
				error: "Upload summary failed in test",
			},
			{
				eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed",
				error: "Upload summary failed in test",
			},
		],
		async () => {
			const mockLogger = new MockLogger();
			const { summarizer: summarizer1 } = await createSummarizer(
				provider,
				mainContainer,
				undefined /** config */,
				undefined /** summaryVersion */,
				mockLogger,
			);

			// Create data stores B and mark it as referenced.
			const dataStoreB = await createNewDataStore();
			dataStoreA._root.set("dataStoreB", dataStoreB.handle);

			// Create 10 data stores and mark them referenced by adding their handle to dataStoreB.
			for (let i = 1; i <= 10; i++) {
				const newDataStore = await createNewDataStore();
				dataStoreB._root.set(`dataStoreB-${i}`, newDataStore.handle);
			}
			await provider.ensureSynchronized();
			// Summarize so that GC state is updated with the above data stores.
			await assert.doesNotReject(summarizeNow(summarizer1), "Summarize should have passed");

			// Delete reference to dataStoreB. This will make dataStoreB and the 10 data store references it contains
			// unreferenced. These will be summarized and the GC state updated count will include them.
			dataStoreA._root.delete("dataStoreB");
			await provider.ensureSynchronized();

			// The next summary should fail - Override the "uploadSummaryWithContext" function so that that step fails.
			const containerRuntime1 = (summarizer1 as any).runtime as ContainerRuntime;
			const uploadSummaryWithContextFunc = containerRuntime1.storage.uploadSummaryWithContext;
			const uploadSummaryWithContextOverride = async () => {
				throw new Error("Upload summary failed in test");
			};
			containerRuntime1.storage.uploadSummaryWithContext = uploadSummaryWithContextOverride;

			// Summarize and validate that it fails.
			const errorFn = (error: Error): boolean => {
				assert.strictEqual(
					error.message,
					"Upload summary failed in test",
					"unexpected summary failures",
				);
				return true;
			};
			await assert.rejects(summarizeNow(summarizer1), errorFn, "Summarize should have failed");
			// There should not be any IncrementalSummaryViolation errors.
			mockLogger.assertMatchNone([{ eventName: "IncrementalSummaryViolation" }]);

			// Revert the "uploadSummaryWithContext" function so that summary will now succeed.
			containerRuntime1.storage.uploadSummaryWithContext = uploadSummaryWithContextFunc;

			// Summarize and validate that it succeeds.
			await assert.doesNotReject(summarizeNow(summarizer1), "Summarize should have passed");
			// There should not be any IncrementalSummaryViolation errors.
			mockLogger.assertMatchNone([{ eventName: "IncrementalSummaryViolation" }]);
		},
	);
});
