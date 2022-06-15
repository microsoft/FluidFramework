/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { stringToBuffer } from "@fluidframework/common-utils";
import { ContainerRuntime, IContainerRuntimeOptions, IGCStats } from "@fluidframework/container-runtime";
import { Container } from "@fluidframework/container-loader";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { ISummaryStats } from "@fluidframework/runtime-definitions";
import { calculateStats, mergeStats, requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { TestDataObject } from "../mockSummarizerClient";

/**
 * Validates that we generate correct garbage collection stats, such as total number of nodes, number of unreferenced
 * nodes, data stores, blobs, etc.
 */
describeFullCompat("Garbage Collection Stats", (getTestObjectProvider) => {
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            summaryConfigOverrides: {
                state: "disabled",
            },
        },
        gcOptions: { gcAllowed: true },
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        undefined,
        runtimeOptions,
    );

    let provider: ITestObjectProvider;
    let containerRuntime: ContainerRuntime;
    let defaultDataStore: TestDataObject;

    const createContainer = async () => provider.createContainer(runtimeFactory);

    /**
     * Returns the summary stats in the summary for the data stores with the gives ids.
     */
    function getDataStoreSummaryStats(summary: ISummaryTree, dataStoreIds: string[]): ISummaryStats {
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

    before(function() {
        provider = getTestObjectProvider();
        // These tests validate the GC stats in summary by calling summarize directly on the container runtime.
        // They do not post these summaries or download them. So, it doesn't need to run against real services.
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    beforeEach(async () => {
        const container = await createContainer() as Container;
        defaultDataStore = await requestFluidObject<TestDataObject>(container, "/");
        containerRuntime = defaultDataStore.containerRuntime;
    });

    /**
     * There are 9 GC nodes in total in these tests:
     * 1 containers root.
     * 3 data stores.
     * 3 x 1 DDS for each data store.
     * 2 attachment blobs.
     */
    it("can correctly generate GC stats without unreferenced nodes", async () => {
        const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
        const dataStore2 = await dataObjectFactory.createInstance(containerRuntime);
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
        };

        // Add both data store handles in default data store to mark them referenced.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        defaultDataStore._root.set("dataStore2", dataStore2.handle);

        // Upload 2 attachment blobs and store their handles to mark them referenced.
        const blob1Contents = "Blob contents 1";
        const blob2Contents = "Blob contents 2";
        const blob1Handle = await defaultDataStore._context.uploadBlob(stringToBuffer(blob1Contents, "utf-8"));
        const blob2Handle = await defaultDataStore._context.uploadBlob(stringToBuffer(blob2Contents, "utf-8"));
        defaultDataStore._root.set("blob1", blob1Handle);
        defaultDataStore._root.set("blob2", blob2Handle);

        await provider.ensureSynchronized();

        // Nothing should be unreferenced.
        const gcStats = await containerRuntime.collectGarbage({});
        assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

        const summarizeResult = await containerRuntime.summarize({ trackState: false });
        assert.strictEqual(summarizeResult.stats.unreferencedBlobSize, 0, "There shouldn't be unreferenced blobs");
    });

    it("can correctly generate GC stats when nodes are unreferenced", async () => {
        const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
        const dataStore2 = await dataObjectFactory.createInstance(containerRuntime);
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
        };

        // Add both data store handles in default data store to mark them referenced.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        defaultDataStore._root.set("dataStore2", dataStore2.handle);

        // Upload 2 attachment blobs and store their handles to mark them referenced.
        const blob1Contents = "Blob contents 1";
        const blob2Contents = "Blob contents 2";
        const blob1Handle = await defaultDataStore._context.uploadBlob(stringToBuffer(blob1Contents, "utf-8"));
        const blob2Handle = await defaultDataStore._context.uploadBlob(stringToBuffer(blob2Contents, "utf-8"));
        defaultDataStore._root.set("blob1", blob1Handle);
        defaultDataStore._root.set("blob2", blob2Handle);

        await provider.ensureSynchronized();

        let gcStats = await containerRuntime.collectGarbage({});
        assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

        // Remove dataStore1 and blob1's handles to mark them unreferenced.
        defaultDataStore._root.delete("dataStore1");
        defaultDataStore._root.delete("blob1");
        await provider.ensureSynchronized();

        // dataStore1, its DDS and blob1 should be now unreferenced. Also, their reference state updated from referenced
        // to unreferenced.
        expectedGCStats.unrefNodeCount = 3;
        expectedGCStats.updatedNodeCount = 3;
        expectedGCStats.unrefDataStoreCount = 1;
        expectedGCStats.updatedDataStoreCount = 1;
        expectedGCStats.unrefAttachmentBlobCount = 1;
        expectedGCStats.updatedAttachmentBlobCount = 1;

        gcStats = await containerRuntime.collectGarbage({});
        assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

        let summarizeResult = await containerRuntime.summarize({ trackState: false });
        let unrefDataStoreStats = getDataStoreSummaryStats(summarizeResult.summary, [dataStore1.id]);
        assert.strictEqual(
            summarizeResult.stats.unreferencedBlobSize,
            unrefDataStoreStats.totalBlobSize,
            "dataStore1's blobs should be in unreferenced blob size",
        );

        // Remove dataStore2 and blob2's handles to mark them unreferenced.
        defaultDataStore._root.delete("dataStore2");
        defaultDataStore._root.delete("blob2");
        await provider.ensureSynchronized();

        // dataStore1, dataStore2, their DDS and blob2 should be now unreferenced. Also, dataStore2, its DDS and blob2's
        // reference state updated from referenced to unreferenced.
        expectedGCStats.unrefNodeCount = 6;
        expectedGCStats.updatedNodeCount = 3;
        expectedGCStats.unrefDataStoreCount = 2;
        expectedGCStats.updatedDataStoreCount = 1;
        expectedGCStats.unrefAttachmentBlobCount = 2;
        expectedGCStats.updatedAttachmentBlobCount = 1;

        gcStats = await containerRuntime.collectGarbage({});
        assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

        summarizeResult = await containerRuntime.summarize({ trackState: false });
        unrefDataStoreStats = getDataStoreSummaryStats(summarizeResult.summary, [dataStore1.id, dataStore2.id]);
        assert.strictEqual(
            summarizeResult.stats.unreferencedBlobSize,
            unrefDataStoreStats.totalBlobSize,
            "dataStore1 and dataStore2's blobs should be in unreferenced blob size",
        );
    });

    it("can correctly generate GC stats when nodes are re-referenced", async () => {
        const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
        const dataStore2 = await dataObjectFactory.createInstance(containerRuntime);
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
        };

        // Add both data store handles in default data store to mark them referenced.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        defaultDataStore._root.set("dataStore2", dataStore2.handle);

        // Upload 2 attachment blobs and store their handles to mark them referenced.
        const blob1Contents = "Blob contents 1";
        const blob2Contents = "Blob contents 2";
        const blob1Handle = await defaultDataStore._context.uploadBlob(stringToBuffer(blob1Contents, "utf-8"));
        const blob2Handle = await defaultDataStore._context.uploadBlob(stringToBuffer(blob2Contents, "utf-8"));
        defaultDataStore._root.set("blob1", blob1Handle);
        defaultDataStore._root.set("blob2", blob2Handle);
        await provider.ensureSynchronized();

        // Remove both data store and both blob handles to mark them unreferenced.
        defaultDataStore._root.delete("dataStore1");
        defaultDataStore._root.delete("dataStore2");
        defaultDataStore._root.delete("blob1");
        defaultDataStore._root.delete("blob2");
        await provider.ensureSynchronized();

        // Add all handles back to re-reference them.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        defaultDataStore._root.set("dataStore2", dataStore2.handle);
        defaultDataStore._root.set("blob1", blob1Handle);
        defaultDataStore._root.set("blob2", blob2Handle);
        await provider.ensureSynchronized();

        // Nothing should be unreferenced.
        const gcStats = await containerRuntime.collectGarbage({});
        assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

        const summarizeResult = await containerRuntime.summarize({ trackState: false });
        assert.strictEqual(summarizeResult.stats.unreferencedBlobSize, 0, "There shouldn't be unreferenced blobs");
    });

    it("can correctly generate GC stats when reference state changes between GC runs", async () => {
        const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
        const dataStore2 = await dataObjectFactory.createInstance(containerRuntime);
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
        };

        // Add both data store handles in default data store to mark them referenced.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        defaultDataStore._root.set("dataStore2", dataStore2.handle);
        await provider.ensureSynchronized();

        // Nothing should be unreferenced.
        let gcStats = await containerRuntime.collectGarbage({});
        assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

        // Remove both data store handles to mark them unreferenced.
        defaultDataStore._root.delete("dataStore1");
        defaultDataStore._root.delete("dataStore2");
        await provider.ensureSynchronized();

        // dataStore1, dataStore2 and their DDS should be now unreferenced. Also, their reference state updated
        // from referenced to unreferenced.
        expectedGCStats.unrefNodeCount = 4;
        expectedGCStats.updatedNodeCount = 4;
        expectedGCStats.unrefDataStoreCount = 2;
        expectedGCStats.updatedDataStoreCount = 2;

        gcStats = await containerRuntime.collectGarbage({});
        assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");

        // Add their handle back to re-reference them.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        defaultDataStore._root.set("dataStore2", dataStore2.handle);
        await provider.ensureSynchronized();

        // dataStore1, dataStore2 and their DDS should be now referenced. Also, their reference state updated
        // from unreferenced to referenced.
        expectedGCStats.unrefNodeCount = 0;
        expectedGCStats.unrefDataStoreCount = 0;

        gcStats = await containerRuntime.collectGarbage({});
        assert.deepStrictEqual(gcStats, expectedGCStats, "GC stats is not as expected");
    });
});
