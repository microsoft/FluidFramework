/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ISummarizer } from "@fluidframework/container-runtime/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import {
	IContainerRuntimeBase,
	channelsTreeName,
} from "@fluidframework/runtime-definitions/internal";
import {
	ITestObjectProvider,
	createSummarizer,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

/**
 * Validates that the data store summary is as expected.
 * If expectHandle is false, the data store summary should be a tree.
 * If expectHandle is true, the data store summary should be a handle and the handle id should be correct.
 */
function validateDataStoreStateInSummary(
	summaryTree: ISummaryTree,
	dataStoreId: string,
	expectHandle: boolean,
) {
	const channelsTree = (summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
	const dataStoreSummaryObject = channelsTree[dataStoreId];

	if (!expectHandle) {
		assert.strictEqual(
			dataStoreSummaryObject.type,
			SummaryType.Tree,
			"Data store summary should be a tree",
		);
		return;
	}

	// The handle id for data store should be under ".channels" as that is where the summary tree
	// for a data store is.
	const expectedHandleId = `/${channelsTreeName}/${dataStoreId}`;
	assert.strictEqual(
		dataStoreSummaryObject.type,
		SummaryType.Handle,
		"Data store summary should be a handle",
	);
	assert.strictEqual(
		dataStoreSummaryObject.handle,
		expectedHandleId,
		"Data store handle is incorrect",
	);
}

/**
 * Validates that the DDS summary is as expected.
 * If expectHandle is false, the DDS summary should be a tree.
 * If expectHandle is true, the DDS summary should be a handle and the handle id should be correct.
 */
function validateDDSStateInSummary(
	summaryTree: ISummaryTree,
	dataStoreId: string,
	ddsId: string,
	expectHandle: boolean,
) {
	const dataStoreChannelsTree = (summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
	const dataStoreSummaryTree = dataStoreChannelsTree[dataStoreId];
	assert.strictEqual(
		dataStoreSummaryTree.type,
		SummaryType.Tree,
		"Data store summary should be a tree",
	);

	const ddsChannelsTree = (dataStoreSummaryTree.tree[channelsTreeName] as ISummaryTree).tree;
	const ddsSummaryObject = ddsChannelsTree[ddsId];

	if (!expectHandle) {
		assert.strictEqual(
			ddsSummaryObject.type,
			SummaryType.Tree,
			"DDS summary should be a tree",
		);
		return;
	}

	// The handle id for DDS should be under ".channels/<dataStoreId>/.channels" as that is where the summary tree
	// for a DDS is.
	const expectedHandleId = `/${channelsTreeName}/${dataStoreId}/${channelsTreeName}/${ddsId}`;
	assert.strictEqual(
		ddsSummaryObject.type,
		SummaryType.Handle,
		"DDS summary should be a handle",
	);
	assert.strictEqual(ddsSummaryObject.handle, expectedHandleId, "DDS handle is incorrect");
}

/**
 * These tests validate that data stores and DDSes do incremental summaries correctly, i.e., if the data
 * in it does not change, it summaries using a SummaryHandle and not a SummaryTree.
 */
describeCompat(
	"Incremental summaries for data store and DDS",
	"FullCompat",
	(getTestObjectProvider, apis) => {
		const { SharedDirectory } = apis.dds;
		let provider: ITestObjectProvider;
		let container: IContainer;
		let dataObject1: ITestDataObject;
		let containerRuntime: IContainerRuntimeBase;
		let summarizer: ISummarizer;

		beforeEach(async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			// if (provider.driver.type !== "local") {
			// 	this.skip();
			// }
			container = await provider.makeTestContainer();
			dataObject1 = await getContainerEntryPointBackCompat(container);
			containerRuntime = dataObject1._context.containerRuntime;
			await waitForContainerConnection(container);

			summarizer = (await createSummarizer(provider, container)).summarizer;
		});

		it("can do incremental data store summary", async function () {
			const dataStore2 = await containerRuntime.createDataStore(TestDataObjectType);
			const dataObject2 = await getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore2);
			dataObject1._root.set("dataObject2", dataObject2.handle);

			await provider.ensureSynchronized();
			let summary = await summarizeNow(summarizer);
			// Both data stores should be summarized as trees since they both changed since last summary.
			validateDataStoreStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				false /* expectHandle */,
			);
			validateDataStoreStateInSummary(
				summary.summaryTree,
				dataObject2._context.id,
				false /* expectHandle */,
			);

			await provider.ensureSynchronized();
			summary = await summarizeNow(summarizer);
			// Both data stores should be summarized as handles since they didn't change.
			validateDataStoreStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				true /* expectHandle */,
			);
			validateDataStoreStateInSummary(
				summary.summaryTree,
				dataObject2._context.id,
				true /* expectHandle */,
			);

			dataObject1._root.set("key", "value");
			await provider.ensureSynchronized();
			summary = await summarizeNow(summarizer);
			// Data store 1 should be summarized as a tree since it changed (sent an op).
			// Data store 2 should be summarized as a handle since it did not change.
			validateDataStoreStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				false /* expectHandle */,
			);
			validateDataStoreStateInSummary(
				summary.summaryTree,
				dataObject2._context.id,
				true /* expectHandle */,
			);
		});

		// Pragya fixme
		it("can do incremental dds summary", async () => {
			const directory2 = SharedDirectory.create(dataObject1._runtime);
			dataObject1._root.set("directory2", directory2.handle);

			const directory3 = SharedDirectory.create(dataObject1._runtime);
			dataObject1._root.set("directory3", directory3.handle);

			await provider.ensureSynchronized();
			let summary = await summarizeNow(summarizer);
			// All 3 DDSes should be summarized as trees because they all changed since last summary.
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				dataObject1._root.id,
				false /* expectHandle */,
			);
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				directory2.id,
				false /* expectHandle */,
			);
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				directory3.id,
				false /* expectHandle */,
			);

			directory3.set("key", "value");
			await provider.ensureSynchronized();
			summary = await summarizeNow(summarizer);
			// Only DDS 3 should be summarized as tree since it changed (sent an op). The rest should be trees.
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				dataObject1._root.id,
				true /* expectHandle */,
			);
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				directory2.id,
				true /* expectHandle */,
			);
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				directory3.id,
				false /* expectHandle */,
			);

			dataObject1._root.set("key", "value");
			await provider.ensureSynchronized();
			summary = await summarizeNow(summarizer);
			// Only DDS 1 should be summarized as tree since it changed (sent an op). The rest should be trees.
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				dataObject1._root.id,
				false /* expectHandle */,
			);
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				directory2.id,
				true /* expectHandle */,
			);
			validateDDSStateInSummary(
				summary.summaryTree,
				dataObject1._context.id,
				directory3.id,
				true /* expectHandle */,
			);
		});
	},
);
