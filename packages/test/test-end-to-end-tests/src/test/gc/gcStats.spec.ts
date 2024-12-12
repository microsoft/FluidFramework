/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import { IContainer, DisconnectReason } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	IGCRuntimeOptions,
	IGCStats,
} from "@fluidframework/container-runtime/internal";
import { delay } from "@fluidframework/core-utils/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import { ISummaryStats } from "@fluidframework/runtime-definitions/internal";
import { calculateStats, mergeStats } from "@fluidframework/runtime-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createTestConfigProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { waitForContainerWriteModeConnectionWrite } from "./gcTestSummaryUtils.js";

/**
 * Validates that we generate correct garbage collection stats, such as total number of nodes, number of unreferenced
 * nodes, data stores, blobs, etc.
 */
describeCompat("Garbage Collection Stats", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let mainDataObject: ITestDataObject;
	let summarizerRuntime: ContainerRuntime;
	const tombstoneTimeoutMs = 200;
	const sweepGracePeriodMs = 0;

	const configProvider = createTestConfigProvider();

	// GC options with sweep enabled.
	const gcOptions: IGCRuntimeOptions = {
		inactiveTimeoutMs: 0,
		enableGCSweep: true,
		sweepGracePeriodMs,
	};
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
			gcOptions,
		},
		loaderProps: { configProvider },
	};

	/**
	 * Returns the summary stats in the summary for the data stores with the gives ids.
	 */
	function getDataStoreSummaryStats(
		summary: ISummaryTree,
		dataStoreIds: string[],
	): ISummaryStats {
		let summaryStats: ISummaryStats = {
			treeNodeCount: 0,
			blobNodeCount: 0,
			handleNodeCount: 0,
			totalBlobSize: 0,
			unreferencedBlobSize: 0,
		};

		const channelsTree = (summary.tree[".channels"] as ISummaryTree)?.tree ?? summary.tree;
		for (const [id, summaryObject] of Object.entries(channelsTree)) {
			if (dataStoreIds.includes(id)) {
				assert(
					summaryObject.type === SummaryType.Tree,
					`Data store ${id}'s entry is not a tree`,
				);
				summaryStats = mergeStats(summaryStats, calculateStats(summaryObject));
			}
		}
		return summaryStats;
	}

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		// These tests validate the GC stats in summary. It disables heuristics and summarizes explicitly on a separate
		// container. They do not submits these summaries so it doesn't need to run against real services.
		if (provider.driver.type !== "local") {
			this.skip();
		}

		configProvider.set(
			"Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs",
			tombstoneTimeoutMs,
		);
		mainContainer = await provider.makeTestContainer(testContainerConfig);
		mainDataObject = (await mainContainer.getEntryPoint()) as ITestDataObject;
		await waitForContainerConnection(mainContainer);

		// Create a second summarizer for running GC and summarizing so that it doesn't summarize local changes.
		const summarizerContainer = await provider.loadTestContainer(testContainerConfig);
		const summarizerDataObject =
			(await summarizerContainer.getEntryPoint()) as ITestDataObject;
		summarizerRuntime = summarizerDataObject._context.containerRuntime as ContainerRuntime;

		// Ensure the container used to summarize is in write mode. This is necessary because this container may
		// submit a GC op when GC runs. If it's in read mode, it would attempt to resubmit the op and that would
		// result in closing the container (GC op can't be resubmitted).
		summarizerDataObject._root.set("write", "mode");
		await waitForContainerWriteModeConnectionWrite(summarizerContainer);
	});

	afterEach(() => {
		configProvider.clear();
	});

	async function createNewDataStore() {
		const newDataStore =
			await mainDataObject._context.containerRuntime.createDataStore(TestDataObjectType);
		return (await newDataStore.entryPoint.get()) as ITestDataObject;
	}

	/**
	 * There are 9 GC nodes in total in these tests:
	 * 1 containers root.
	 * 3 data stores.
	 * 3 x 1 DDS for each data store.
	 * 2 attachment blobs.
	 */
	it("can correctly generate GC stats without unreferenced nodes", async () => {
		const dataStore1 = await createNewDataStore();
		const dataStore2 = await createNewDataStore();
		const expectedGCStats: IGCStats = {
			nodeCount: 9,
			unrefNodeCount: 0,
			updatedNodeCount: 9,
			dataStoreCount: 3,
			unrefDataStoreCount: 0,
			updatedDataStoreCount: 3,
			attachmentBlobCount: 2,
			unrefAttachmentBlobCount: 0,
			updatedAttachmentBlobCount: 2,
			lifetimeNodeCount: 9,
			lifetimeDataStoreCount: 3,
			lifetimeAttachmentBlobCount: 2,
			deletedNodeCount: 0,
			deletedDataStoreCount: 0,
			deletedAttachmentBlobCount: 0,
		};

		// Add both data store handles in default data store to mark them referenced.
		mainDataObject._root.set("dataStore1", dataStore1.handle);
		mainDataObject._root.set("dataStore2", dataStore2.handle);

		// Upload 2 attachment blobs and store their handles to mark them referenced.
		const blob1Contents = "Blob contents 1";
		const blob2Contents = "Blob contents 2";
		// Blob stats will be different if we upload while not connected
		await waitForContainerWriteModeConnectionWrite(mainContainer);
		const blob1Handle = await mainDataObject._context.uploadBlob(
			stringToBuffer(blob1Contents, "utf-8"),
		);
		const blob2Handle = await mainDataObject._context.uploadBlob(
			stringToBuffer(blob2Contents, "utf-8"),
		);
		mainDataObject._root.set("blob1", blob1Handle);
		mainDataObject._root.set("blob2", blob2Handle);

		await provider.ensureSynchronized();

		// Nothing should be unreferenced.
		const gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

		const summarizeResult = await summarizerRuntime.summarize({ fullTree: true });
		assert.strictEqual(
			summarizeResult.stats.unreferencedBlobSize,
			0,
			"There shouldn't be unreferenced blobs",
		);
	});

	it("can correctly generate GC stats when nodes are unreferenced", async () => {
		const dataStore1 = await createNewDataStore();
		const dataStore2 = await createNewDataStore();
		const expectedGCStats: IGCStats = {
			nodeCount: 9,
			unrefNodeCount: 0,
			updatedNodeCount: 9,
			dataStoreCount: 3,
			unrefDataStoreCount: 0,
			updatedDataStoreCount: 3,
			attachmentBlobCount: 2,
			unrefAttachmentBlobCount: 0,
			updatedAttachmentBlobCount: 2,
			lifetimeNodeCount: 9,
			lifetimeDataStoreCount: 3,
			lifetimeAttachmentBlobCount: 2,
			deletedNodeCount: 0,
			deletedDataStoreCount: 0,
			deletedAttachmentBlobCount: 0,
		};

		// Add both data store handles in default data store to mark them referenced.
		mainDataObject._root.set("dataStore1", dataStore1.handle);
		mainDataObject._root.set("dataStore2", dataStore2.handle);

		// Upload 2 attachment blobs and store their handles to mark them referenced.
		const blob1Contents = "Blob contents 1";
		const blob2Contents = "Blob contents 2";
		// Blob stats will be different if we upload while not connected
		await waitForContainerWriteModeConnectionWrite(mainContainer);
		const blob1Handle = await mainDataObject._context.uploadBlob(
			stringToBuffer(blob1Contents, "utf-8"),
		);
		const blob2Handle = await mainDataObject._context.uploadBlob(
			stringToBuffer(blob2Contents, "utf-8"),
		);
		mainDataObject._root.set("blob1", blob1Handle);
		mainDataObject._root.set("blob2", blob2Handle);

		await provider.ensureSynchronized();

		let gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "1. GC stats is not as expected");

		// Remove the data store and blob handles to mark them unreferenced.
		mainDataObject._root.delete("dataStore1");
		mainDataObject._root.delete("dataStore2");
		mainDataObject._root.delete("blob1");
		mainDataObject._root.delete("blob2");
		await provider.ensureSynchronized();

		// the data stores, their DDS and the blobs should be now unreferenced. Also, their reference state updated from
		// referenced to unreferenced.
		expectedGCStats.unrefNodeCount += 6;
		expectedGCStats.updatedNodeCount = 6;
		expectedGCStats.unrefDataStoreCount += 2;
		expectedGCStats.updatedDataStoreCount = 2;
		expectedGCStats.unrefAttachmentBlobCount += 2;
		expectedGCStats.updatedAttachmentBlobCount = 2;

		gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "2. GC stats is not as expected");

		const summarizeResult = await summarizerRuntime.summarize({ fullTree: true });
		const unrefDataStoreStats = getDataStoreSummaryStats(summarizeResult.summary, [
			dataStore1._context.id,
			dataStore2._context.id,
		]);
		assert.strictEqual(
			summarizeResult.stats.unreferencedBlobSize,
			unrefDataStoreStats.totalBlobSize,
			"dataStore1's blobs should be in unreferenced blob size",
		);
	});

	it("can correctly generate GC stats when nodes are sweep ready or deleted", async () => {
		const dataStore1 = await createNewDataStore();
		const dataStore2 = await createNewDataStore();
		const expectedGCStats: IGCStats = {
			nodeCount: 9,
			unrefNodeCount: 0,
			updatedNodeCount: 9,
			dataStoreCount: 3,
			unrefDataStoreCount: 0,
			updatedDataStoreCount: 3,
			attachmentBlobCount: 2,
			unrefAttachmentBlobCount: 0,
			updatedAttachmentBlobCount: 2,
			lifetimeNodeCount: 9,
			lifetimeDataStoreCount: 3,
			lifetimeAttachmentBlobCount: 2,
			deletedNodeCount: 0,
			deletedDataStoreCount: 0,
			deletedAttachmentBlobCount: 0,
		};

		// Add both data store handles in default data store to mark them referenced.
		mainDataObject._root.set("dataStore1", dataStore1.handle);
		mainDataObject._root.set("dataStore2", dataStore2.handle);

		// Upload 2 attachment blobs and store their handles to mark them referenced.
		const blob1Contents = "Blob contents 1";
		const blob2Contents = "Blob contents 2";
		// Blob stats will be different if we upload while not connected
		await waitForContainerWriteModeConnectionWrite(mainContainer);
		const blob1Handle = await mainDataObject._context.uploadBlob(
			stringToBuffer(blob1Contents, "utf-8"),
		);
		const blob2Handle = await mainDataObject._context.uploadBlob(
			stringToBuffer(blob2Contents, "utf-8"),
		);
		mainDataObject._root.set("blob1", blob1Handle);
		mainDataObject._root.set("blob2", blob2Handle);

		// Remove dataStore1 and blob1's handles to mark them unreferenced.
		mainDataObject._root.delete("dataStore1");
		mainDataObject._root.delete("blob1");
		await provider.ensureSynchronized();

		// dataStore1, its DDS and blob1 should be now unreferenced. Also, their reference state updated from referenced
		// to unreferenced.
		expectedGCStats.unrefNodeCount += 3;
		expectedGCStats.unrefDataStoreCount += 1;
		expectedGCStats.unrefAttachmentBlobCount += 1;

		let gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "1. GC stats is not as expected");

		// Sweep ready stats. Wait for sweep timeout and send an op to update the current reference timestamp. Usually,
		// GC wouldn't run without ops so this step is not needed for heuristics based summaries. It's needed here
		// because we are explicitly running GC in absence of ops.
		// All the unreferenced nodes should be sweep ready and should show up as deleted. This GC run should also
		// generate a GC delete op.
		await delay(tombstoneTimeoutMs + sweepGracePeriodMs);
		mainDataObject._root.set("update", "timestamp");
		await provider.ensureSynchronized();

		// Data store 1, its DDS and blob 1 should show up as deleted.
		expectedGCStats.deletedNodeCount += 3;
		expectedGCStats.updatedNodeCount = 0;
		expectedGCStats.deletedDataStoreCount += 1;
		expectedGCStats.updatedDataStoreCount = 0;
		expectedGCStats.deletedAttachmentBlobCount += 1;
		expectedGCStats.updatedAttachmentBlobCount = 0;

		gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "2. GC stats is not as expected");

		// Close the main container before running GC which generates a GC op. Otherwise, it will hit this error
		// "GC_Deleted_DataStore_Unexpected_Delete". We don't expect local data stores to be deleted because
		// their session expires before deletion. This mimics that behavior.
		mainContainer.close(DisconnectReason.Expected);

		// Data store 1, its DDS and blob 1 should now be deleted.
		expectedGCStats.nodeCount -= 3;
		expectedGCStats.unrefNodeCount -= 3;
		expectedGCStats.dataStoreCount -= 1;
		expectedGCStats.unrefDataStoreCount -= 1;
		expectedGCStats.attachmentBlobCount -= 1;
		expectedGCStats.unrefAttachmentBlobCount -= 1;

		// Deleted stats. Run GC again. This time the sweep ready nodes should have been deleted.
		await provider.ensureSynchronized();
		gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "3. GC stats is not as expected");
	});

	it("can correctly generate GC stats when nodes are re-referenced", async () => {
		const dataStore1 = await createNewDataStore();
		const dataStore2 = await createNewDataStore();
		const expectedGCStats: IGCStats = {
			nodeCount: 9,
			unrefNodeCount: 0,
			updatedNodeCount: 9,
			dataStoreCount: 3,
			unrefDataStoreCount: 0,
			updatedDataStoreCount: 3,
			attachmentBlobCount: 2,
			unrefAttachmentBlobCount: 0,
			updatedAttachmentBlobCount: 2,
			lifetimeNodeCount: 9,
			lifetimeDataStoreCount: 3,
			lifetimeAttachmentBlobCount: 2,
			deletedNodeCount: 0,
			deletedDataStoreCount: 0,
			deletedAttachmentBlobCount: 0,
		};

		// Add both data store handles in default data store to mark them referenced.
		mainDataObject._root.set("dataStore1", dataStore1.handle);
		mainDataObject._root.set("dataStore2", dataStore2.handle);

		// Upload 2 attachment blobs and store their handles to mark them referenced.
		const blob1Contents = "Blob contents 1";
		const blob2Contents = "Blob contents 2";
		// Blob stats will be different if we upload while not connected
		await waitForContainerWriteModeConnectionWrite(mainContainer);
		const blob1Handle = await mainDataObject._context.uploadBlob(
			stringToBuffer(blob1Contents, "utf-8"),
		);
		const blob2Handle = await mainDataObject._context.uploadBlob(
			stringToBuffer(blob2Contents, "utf-8"),
		);
		mainDataObject._root.set("blob1", blob1Handle);
		mainDataObject._root.set("blob2", blob2Handle);

		// Remove both data store and both blob handles to mark them unreferenced.
		mainDataObject._root.delete("dataStore1");
		mainDataObject._root.delete("dataStore2");
		mainDataObject._root.delete("blob1");
		mainDataObject._root.delete("blob2");
		await provider.ensureSynchronized();

		// Add all handles back to re-reference them.
		mainDataObject._root.set("dataStore1", dataStore1.handle);
		mainDataObject._root.set("dataStore2", dataStore2.handle);
		mainDataObject._root.set("blob1", blob1Handle);
		mainDataObject._root.set("blob2", blob2Handle);
		await provider.ensureSynchronized();

		// Nothing should be unreferenced.
		const gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

		const summarizeResult = await summarizerRuntime.summarize({ fullTree: true });
		assert.strictEqual(
			summarizeResult.stats.unreferencedBlobSize,
			0,
			"There shouldn't be unreferenced blobs",
		);
	});

	it("can correctly generate GC stats when reference state changes between GC runs", async () => {
		const dataStore1 = await createNewDataStore();
		const dataStore2 = await createNewDataStore();
		const expectedGCStats: IGCStats = {
			nodeCount: 7,
			unrefNodeCount: 0,
			updatedNodeCount: 7,
			dataStoreCount: 3,
			unrefDataStoreCount: 0,
			updatedDataStoreCount: 3,
			attachmentBlobCount: 0,
			unrefAttachmentBlobCount: 0,
			updatedAttachmentBlobCount: 0,
			lifetimeNodeCount: 7,
			lifetimeDataStoreCount: 3,
			lifetimeAttachmentBlobCount: 0,
			deletedNodeCount: 0,
			deletedDataStoreCount: 0,
			deletedAttachmentBlobCount: 0,
		};

		// Add both data store handles in default data store to mark them referenced.
		mainDataObject._root.set("dataStore1", dataStore1.handle);
		mainDataObject._root.set("dataStore2", dataStore2.handle);
		await provider.ensureSynchronized();

		// Nothing should be unreferenced.
		let gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "1. GC stats is not as expected");

		// Remove both data store handles to mark them unreferenced.
		mainDataObject._root.delete("dataStore1");
		mainDataObject._root.delete("dataStore2");
		await provider.ensureSynchronized();

		// dataStore1, dataStore2 and their DDS should be now unreferenced. Also, their reference state updated
		// from referenced to unreferenced.
		expectedGCStats.unrefNodeCount += 4;
		expectedGCStats.updatedNodeCount = 4;
		expectedGCStats.unrefDataStoreCount += 2;
		expectedGCStats.updatedDataStoreCount = 2;

		gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "2. GC stats is not as expected");

		// Add their handle back to re-reference them.
		mainDataObject._root.set("dataStore1", dataStore1.handle);
		mainDataObject._root.set("dataStore2", dataStore2.handle);
		await provider.ensureSynchronized();

		// dataStore1, dataStore2 and their DDS should be now referenced. Also, their reference state updated
		// from unreferenced to referenced.
		expectedGCStats.unrefNodeCount -= 4;
		expectedGCStats.unrefDataStoreCount -= 2;

		gcStats = await summarizerRuntime.collectGarbage({});
		assert.deepStrictEqual(gcStats, expectedGCStats, "3. GC stats is not as expected");
	});
});
