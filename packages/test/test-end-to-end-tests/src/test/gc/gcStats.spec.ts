/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { Container } from "@fluidframework/container-loader";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { ISummaryStats } from "@fluidframework/runtime-definitions";
import { calculateStats, mergeStats, requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { TestDataObject } from "./mockSummarizerClient";

/**
 * Validates that we generate correct garbage collection stats, such as total number of nodes, number of unreferenced
 * nodes, number of unreferenced data stores, etc.
 */
describeFullCompat("Garbage Collection Stats", (getTestObjectProvider) => {
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
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
    const logger = new TelemetryNullLogger();

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
        for (const [ id, summaryObject ] of Object.entries(channelsTree)) {
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
     * There are 5 GC nodes in total in this tests:
     * 1 for the container's root.
     * 2 for default data store.
     * 2 for the data store created in the test.
     */
    it("can generate GC related stats correctly in summarize and collectGarbage", async () => {
        const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
        const dataStore2 = await dataObjectFactory.createInstance(containerRuntime);

        // Add data store's handle in root component and verify that there are no deleted stats.
        {
            defaultDataStore._root.set("dataStore1", dataStore1.handle);
            defaultDataStore._root.set("dataStore2", dataStore2.handle);
            await provider.ensureSynchronized();

            const gcStats = await containerRuntime.collectGarbage({ logger });
            assert.strictEqual(gcStats.totalNodes, 7, "Total GC nodes in incorrect");
            assert.strictEqual(gcStats.deletedNodes, 0, "There shouldn't be any deleted node");
            assert.strictEqual(gcStats.totalDataStores, 3, "The data store count is incorrect");
            assert.strictEqual(gcStats.deletedDataStores, 0, "There shouldn't be any deleted data stores");

            const { stats } = await containerRuntime.summarize({
                runGC: true,
                fullTree: true,
                trackState: false,
                summaryLogger: logger,
            });
            assert.strictEqual(stats.unreferencedBlobSize, 0, "There shouldn't be unreferenced blobs in summary");
        }

        // Remove dataStore1's handle and verify this deleted data store is reflected in stats.
        {
            defaultDataStore._root.delete("dataStore1");
            await provider.ensureSynchronized();

            const gcStats = await containerRuntime.collectGarbage({ logger });
            assert.strictEqual(gcStats.totalNodes, 7, "Total GC nodes in incorrect");
            assert.strictEqual(gcStats.deletedNodes, 2, "The deleted data store and its DDS is not reflected");
            assert.strictEqual(gcStats.totalDataStores, 3, "The data store count is incorrect");
            assert.strictEqual(gcStats.deletedDataStores, 1, "The deleted data store is not reflected");

            const { summary, stats } = await containerRuntime.summarize({
                runGC: true,
                fullTree: true,
                trackState: false,
                summaryLogger: logger,
            });
            const deletedDataStoreStats = getDataStoreSummaryStats(summary, [ dataStore1.id ]);
            assert.strictEqual(
                stats.unreferencedBlobSize,
                deletedDataStoreStats.totalBlobSize,
                "dataStore1's blobs should be in unreferenced blob size",
            );
        }

        // Remove dataStore1's handle and verify this deleted data store is reflected in stats.
        {
            defaultDataStore._root.delete("dataStore2");
            await provider.ensureSynchronized();

            const gcStats = await containerRuntime.collectGarbage({ logger });
            assert.strictEqual(gcStats.totalNodes, 7, "Total GC nodes in incorrect");
            assert.strictEqual(gcStats.deletedNodes, 4, "The deleted data store and its DDS is not reflected");
            assert.strictEqual(gcStats.totalDataStores, 3, "The data store count is incorrect");
            assert.strictEqual(gcStats.deletedDataStores, 2, "The deleted data store is not reflected");

            const { summary, stats } = await containerRuntime.summarize({
                runGC: true,
                fullTree: true,
                trackState: false,
                summaryLogger: logger,
            });
            const deletedDataStoreStats = getDataStoreSummaryStats(summary, [ dataStore1.id, dataStore2.id ]);
            assert.strictEqual(
                stats.unreferencedBlobSize,
                deletedDataStoreStats.totalBlobSize,
                "dataStore1 and dataStore2's blobs should be in unreferenced blob size",
            );
        }

        // Add data store's handle back and very that there are no deleted stats.
        {
            defaultDataStore._root.set("dataStore1", dataStore1.handle);
            defaultDataStore._root.set("dataStore2", dataStore2.handle);
            await provider.ensureSynchronized();

            const gcStats = await containerRuntime.collectGarbage({ logger });
            assert.strictEqual(gcStats.totalNodes, 7, "Total GC nodes in incorrect");
            assert.strictEqual(gcStats.deletedNodes, 0, "There shouldn't be any deleted node");
            assert.strictEqual(gcStats.totalDataStores, 3, "The data store count is incorrect");
            assert.strictEqual(gcStats.deletedDataStores, 0, "There shouldn't be any deleted data stores");

            const { stats } = await containerRuntime.summarize({
                runGC: true,
                fullTree: true,
                trackState: false,
                summaryLogger: logger,
            });
            assert.strictEqual(stats.unreferencedBlobSize, 0, "There shouldn't be unreferenced blobs in summary");
        }
    });
});
