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
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { IGarbageCollectionState } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { loadSummarizer, TestDataObject, submitAndAckSummary } from "./mockSummarizerClient";

/**
 * Validates that the unreferenced timestamp is correctly set in the summary tree of unreferenced data stores. Also,
 * the timestamp is removed when an unreferenced data store becomes referenced again.
 */
describeFullCompat("GC unreferenced timestamp", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
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
     * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
     * referenced, the ureferenced timestamp is undefined.
     * @returns a map of nodeId to its unreferenced timestamp.
     */
    async function getUnreferencedTimestamps(
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

        const rootGCBlob = latestUploadedSummary.tree.gc;
        assert(rootGCBlob?.type === SummaryType.Blob, `GC blob not available`);

        const gcState = JSON.parse(rootGCBlob.content as string) as IGarbageCollectionState;
        const nodeTimestamps: Map<string, number | undefined> = new Map();
        for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
            nodeTimestamps.set(nodeId.slice(1), nodeData.unreferencedTimestampMs);
        }
        return nodeTimestamps;
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
        const dataStoreA = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("dataStoreA", dataStoreA.handle);

        // Validate that the new data store does not have unreferenced timestamp.
        const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
        const dsATimestamp1 = timestamps1.get(dataStoreA.id);
        assert(dsATimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

        // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
        // unreferenced timestamp.
        mainDataStore._root.delete("dataStoreA");
        const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
        const dsATimestamp2 = timestamps2.get(dataStoreA.id);
        assert(dsATimestamp2 !== undefined, `data store should have unreferenced timestamp after being unreferenced`);

        // Perform some operations and generate another summary. Validate that the data store still has the same
        // unreferenced timestamp.
        mainDataStore._root.set("key", "value");
        const timestamps3 = await getUnreferencedTimestamps(summarizerClient);
        const dsATimestamp3 = timestamps3.get(dataStoreA.id);
        assert(dsATimestamp3 !== undefined, `data store should still have unreferenced timestamp`);
        assert.strictEqual(dsATimestamp2, dsATimestamp3, "unreferenced timestamp should not have changed");

        // Mark the data store as referenced again and validate that the unreferenced timestamp is removed.
        mainDataStore._root.set("dataStoreA", dataStoreA.handle);
        // Validate that the data store does not have unreferenced timestamp after being referenced.
        const timestamps4 = await getUnreferencedTimestamps(summarizerClient);
        const dsATimestamp4 = timestamps4.get(dataStoreA.id);
        assert(dsATimestamp4 === undefined, `data store should not have unreferenced timestamp anymore`);

    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);

    it("uses unreferenced timestamp from previous summary correctly", async () => {
        const summarizerClient1 = await getNewSummarizer();

        // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
        const dataStoreA = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("dataStoreA", dataStoreA.handle);

        // Validate that the new data store does not have unreferenced timestamp.
        const timestamps1 = await getUnreferencedTimestamps(summarizerClient1);
        const dsATimestamp1 = timestamps1.get(dataStoreA.id);
        assert(dsATimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

        // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
        // unreferenced timestamp.
        mainDataStore._root.delete("dataStoreA");
        const timestamps2 = await getUnreferencedTimestamps(summarizerClient1);
        const dsATimestamp2 = timestamps2.get(dataStoreA.id);
        assert(dsATimestamp2 !== undefined, `new data store should have unreferenced timestamp`);

        // Load a new summarizer from the last summary and validate that the unreferenced timestamp from the summary is
        // used for the data store.
        assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
        const summarizerClient2 = await getNewSummarizer(latestAckedSummary.summaryAck.contents.handle);
        const timestamps3 = await getUnreferencedTimestamps(summarizerClient2);
        const dsATimestamp3 = timestamps3.get(dataStoreA.id);
        assert(dsATimestamp3 !== undefined, `new data store should still have unreferenced timestamp`);
        assert.strictEqual(dsATimestamp2, dsATimestamp3, "The unreferenced timestamp should not have changed");

    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(1000000);

    /**
     * This scenario is currently broken. Re-enable test once the following item is completed -
     * https://github.com/microsoft/FluidFramework/issues/7924
     */
    it.skip(`updates unreferenced timestamp when data store transitions between ` +
       `unreferenced -> referenced -> unreferenced between summaries`, async () => {
        const summarizerClient = await getNewSummarizer();

        // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
        const dataStoreA = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("dataStoreA", dataStoreA.handle);
        await provider.ensureSynchronized();

        // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
        // unreferenced timestamp.
        mainDataStore._root.delete("dataStoreA");
        const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
        const dsATimestamp1 = timestamps1.get(dataStoreA.id);
        assert(dsATimestamp1 !== undefined, `data store should have unreferenced timestamp after being unreferenced`);

        // Store the data store's handle in the referenced DDS again and the delete it again. The data store will
        // transition from unreferened -> referenced -> unreferenced before the next summary happens. The data store
        // will still be unreferenced but the unreferenced timestamp should update.
        mainDataStore._root.set("dataStoreA", dataStoreA.handle);
        await provider.ensureSynchronized();
        mainDataStore._root.delete("dataStoreA");

        const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
        const dsATimestamp2 = timestamps2.get(dataStoreA.id);
        assert(dsATimestamp2 !== undefined, `data store should still have unreferenced timestamp`);
        assert(dsATimestamp2 > dsATimestamp1, `new timestamp should be greater that the previous one`);
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
        const timestamps1 = await getUnreferencedTimestamps(summarizerClient);
        const dsBTimestamp1 = timestamps1.get(dataStoreB.id);
        const dsCTimestamp1 = timestamps1.get(dataStoreC.id);
        assert(dsBTimestamp1 !== undefined, `data store B should have unreferenced timestamp after being unreferenced`);
        assert(dsBTimestamp1 === dsCTimestamp1, `data stores B and C should have the same unreferenced time`);

        // Now update the references via ops as follows:
        // 1. Add reference from A -> B
        // 2. Remove reference from B -> C
        // 3. Remove reference from A -> B
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);
        await provider.ensureSynchronized();
        dataStoreB._root.delete("dataStoreC");
        dataStoreA._root.delete("dataStoreB");

        // Validate that both B and C's unreferenced timestamps are updated and are the same.
        const timestamps2 = await getUnreferencedTimestamps(summarizerClient);
        const dsBTimestamp2 = timestamps2.get(dataStoreB.id);
        const dsCTimestamp2 = timestamps2.get(dataStoreC.id);
        assert(dsBTimestamp2 !== undefined, `data store B should still have unreferenced timestamp`);
        assert(dsBTimestamp2 > dsBTimestamp1, `The unreferenced timestamp should have been updated`);
        assert(dsBTimestamp2 === dsCTimestamp2, `data stores B and C should have the same unreferenced time`);
    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);
});
