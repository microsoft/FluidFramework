/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObjectFactory } from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    IAckedSummary,
    IContainerRuntimeOptions,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import {
    ISummaryTree,
    SummaryObject,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { channelsTreeName, IGarbageCollectionSummaryDetails } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { loadSummarizer, TestDataObject, submitAndAckSummary } from "./mockSummarizerClient";

/**
 * Validates that the unreferenced timestamp is correctly set in the summary tree of unreferenced data stores. Also,
 * the timestamp is removed when an unreferenced data store becomes referenced again.
 */
// REVIEW: Enable full compat after runtime version >= 0.48.0
describeNoCompat("GC unreferenced timestamp", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { generateSummaries: false },
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

    // Stores the latest summary uploaded to the server.
    let latestUploadedSummary: ISummaryTree | undefined;
    // Stores the latest summary context uploaded to the server.
    let latestSummaryContext: ISummaryContext | undefined;
    // Stores the latest acked summary for the document.
    let latestAckedSummary: IAckedSummary | undefined;

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    const getNewSummarizer = async (summaryVersion?: string) => {
        return loadSummarizer(provider, runtimeFactory, mainContainer.deltaManager.lastSequenceNumber, summaryVersion);
    };

    /**
     * Callback that will be called by the document storage service whenever a summary is uploaded by the client.
     * Update the summary context to include the summary proposal and ack handle as per the latest ack for the
     * document.
     */
    function uploadSummaryCb(summaryTree: ISummaryTree, context: ISummaryContext): ISummaryContext {
        latestUploadedSummary = summaryTree;
        latestSummaryContext = context;
        const newSummaryContext = { ...context };
        // If we received an ack for this document, update the summary context with its information. The
        // server rejects the summary if it doesn't have the proposal and ack handle of the previous
        // summary.
        if (latestAckedSummary !== undefined) {
            newSummaryContext.ackHandle = latestAckedSummary.summaryAck.contents.handle;
            newSummaryContext.proposalHandle = latestAckedSummary.summaryOp.contents.handle;
        }
        return newSummaryContext;
    }

    /**
     * Generate and submit a summary. Return the data store channels summary tree.
     */
    async function getChannelsSummary(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
    ) {
        const summaryResult = await submitAndAckSummary(provider, summarizerClient, logger, true /* fullTree */);
        latestAckedSummary = summaryResult.ackedSummary;
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );
        assert(latestUploadedSummary !== undefined, "Did not get a summary");
        return (latestUploadedSummary.tree[channelsTreeName] as ISummaryTree)?.tree ?? latestUploadedSummary.tree;
    }

    /**
     * Returns the unreferenced timestamp for the data store with the given id. If the data store is referenced, the
     * ureferenced timestamp is undefined.
     * If channelsSummary parameter is passed, get the unreferenced timestamp off of it. If it is undefined, generate
     * and submit a summary, and get the data store channels summary tree first.
     */
    async function getDataStoreUnreferencedTimestamp(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
        dataStoreId: string,
        channelsSummary?: { [path: string]: SummaryObject },
    ): Promise<number | undefined> {
        const channelsTree = channelsSummary ?? await getChannelsSummary(summarizerClient);
        for (const [ id, summaryObject ] of Object.entries(channelsTree)) {
            if (id === dataStoreId) {
                assert(
                    summaryObject.type === SummaryType.Tree,
                    `Data store ${id}'s entry is not a tree`,
                );
                const gcBlob = summaryObject.tree.gc;
                assert(gcBlob?.type === SummaryType.Blob, `Data store ${id} does not have GC blob`);
                const gcSummaryDetails = JSON.parse(gcBlob.content as string) as IGarbageCollectionSummaryDetails;
                return gcSummaryDetails.unrefTimestamp;
            }
        }
        throw new Error(`Summary does not contain entry for data store ${dataStoreId}`);
    }

    beforeEach(async () => {
        provider = getTestObjectProvider();
        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
        // time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );

        mainContainer = await createContainer();
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");

        await provider.ensureSynchronized();
    });

    afterEach(() => {
        latestAckedSummary = undefined;
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    it("adds / removes unreferenced timestamp from data stores correctly", async () => {
        const summarizerClient = await getNewSummarizer();

        // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
        const newDataStore = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that the new data store does not have unreferenced timestamp.
        const unrefTimestamp1 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

        // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
        // unreferenced timestamp.
        mainDataStore._root.delete("newDataStore");
        const unrefTimestamp2 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp2 !== undefined, `data store should have unreferenced timestamp after being unreferenced`);

        // Perform some operations and generate another summary. Validate that the data store still has the same
        // unreferenced timestamp.
        mainDataStore._root.set("key", "value");
        const unrefTimestamp3 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp3 !== undefined, `data store should still have unreferenced timestamp`);
        assert.strictEqual(unrefTimestamp2, unrefTimestamp3, "unreferenced timestamp should not have changed");

        // Mark the data store as referenced again and validate that the unreferenced timestamp is removed.
        mainDataStore._root.set("newDataStore", newDataStore.handle);
        // Validate that the data store does not have unreferenced timestamp after being referenced.
        const unrefTimestamp4 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp4 === undefined, `data store should not have unreferenced timestamp anymore`);

    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);

    it("uses unreferenced timestamp from previous summary correctly", async () => {
        const summarizerClient1 = await getNewSummarizer();

        // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
        const newDataStore = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that the new data store does not have unreferenced timestamp.
        const unrefTimestamp1 = await getDataStoreUnreferencedTimestamp(summarizerClient1, newDataStore.id);
        assert(unrefTimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

        // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
        // unreferenced timestamp.
        mainDataStore._root.delete("newDataStore");
        const unrefTimestamp2 = await getDataStoreUnreferencedTimestamp(summarizerClient1, newDataStore.id);
        assert(unrefTimestamp2 !== undefined, `new data store should have unreferenced timestamp`);

        // Load a new summarizer from the last summary and validate that the unreferenced timestamp from the summary is
        // used for the data store.
        assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
        const summarizerClient2 = await getNewSummarizer(latestAckedSummary.summaryAck.contents.handle);
        const unrefTimestamp3 =
            await getDataStoreUnreferencedTimestamp(summarizerClient2, newDataStore.id);
        assert(unrefTimestamp3 !== undefined, `new data store should still have unreferenced timestamp`);
        assert.strictEqual(unrefTimestamp2, unrefTimestamp3, "The unreferenced timestamp should not have changed");

    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);

    /**
     * This scenario is currently broken. Re-enable test once the following item is completed -
     * https://github.com/microsoft/FluidFramework/issues/7924
     */
    it.skip(`updates unreferenced timestamp when data store transitions between ` +
       `unreferenced -> referenced -> unreferenced between summaries`, async () => {
        const summarizerClient = await getNewSummarizer();

        // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
        const newDataStore = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("newDataStore", newDataStore.handle);
        await provider.ensureSynchronized();

        // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
        // unreferenced timestamp.
        mainDataStore._root.delete("newDataStore");
        const unrefTimestamp1 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp1 !== undefined, `data store should have unreferenced timestamp after being unreferenced`);

        // Store the data store's handle in the referenced DDS again and the delete it again. The data store will
        // transition from unreferened -> referenced -> unreferenced before the next summary happens. The data store
        // will still be unreferenced but the unreferenced timestamp should update.
        mainDataStore._root.set("newDataStore", newDataStore.handle);
        await provider.ensureSynchronized();
        mainDataStore._root.delete("newDataStore");

        const unrefTimestamp2 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp2 !== undefined, `data store should still have unreferenced timestamp`);
        assert(unrefTimestamp2 > unrefTimestamp1, `new timestamp should be greater that the previous one`);
    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);

    /**
     * Tests the following scenario where A, B and C are data stores:
     * 1. Summary 1 at t1. Reference graph: A -> B -> C.
     * 2. Summary 2 at t2. Reference graph: A    B (t2) -> C (t2). B and C have unreferenced time t2.
     * 3. Op adds reference from A -> B.
     *    Op removes reference from B -> C.
     *    Op removes reference from A -> B.
     *    A client could have added in-memory references to both B and C.
     * 4. Summary 3 at t3. Reference graph: A    B (t3)    C (t3).
     * Validates that the unreferenced time for B and C are t3.
     *
     * This scenario is currently broken. Re-enable test once the following item is completed -
     * https://github.com/microsoft/FluidFramework/issues/7924
    */
    it.skip(`updates unreferenced timestamp when data store has outboung referenes, and transitions between ` +
       `unreferenced -> referenced -> unreferenced between summaries`, async () => {
        const summarizerClient = await getNewSummarizer();
        const dataStoreA = mainDataStore;

        // Create data stores A and B and mark them referenced as follows by storing their handles accordingly:
        // dataStoreA -> dataStoreB -> dataStoreC
        const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
        const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
        dataStoreB._root.set("dataStoreC", dataStoreC.handle);
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);
        await provider.ensureSynchronized();

        // Remove the reference to dataStoreB which marks both B and C as unreferenced.
        dataStoreA._root.delete("dataStoreB");

        // Validate that both B and C are both marked unreferenced at the same time.
        const channelsSummary1 = await getChannelsSummary(summarizerClient);
        const dsBTime1 = await getDataStoreUnreferencedTimestamp(summarizerClient, dataStoreB.id, channelsSummary1);
        assert(dsBTime1 !== undefined, `data store B should have unreferenced timestamp after being unreferenced`);
        const dsCTime1 = await getDataStoreUnreferencedTimestamp(summarizerClient, dataStoreC.id, channelsSummary1);
        assert(dsBTime1 === dsCTime1, `data stores B and C should have the same unreferenced time`);

        // Now update the references via ops as follows:
        // 1. Add reference from A -> B
        // 2. Remove reference from B -> C
        // 3. Remove reference from A -> B
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);
        await provider.ensureSynchronized();
        dataStoreB._root.delete("dataStoreC");
        dataStoreA._root.delete("dataStoreB");

        // Validate that both B and C's unreferenced timestamps are updated and are the same.
        const channelsSummary2 = await getChannelsSummary(summarizerClient);
        const dsBTime2 = await getDataStoreUnreferencedTimestamp(summarizerClient, dataStoreB.id, channelsSummary2);
        assert(dsBTime2 !== undefined, `data store B should still have unreferenced timestamp`);
        assert(dsBTime2 > dsBTime1, `The unreferenced timestamp should have been updated`);
        const dsCTime2 = await getDataStoreUnreferencedTimestamp(summarizerClient, dataStoreC.id, channelsSummary2);
        assert(dsBTime2 === dsCTime2, `data stores B and C should have the same unreferenced time`);
    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);
});
