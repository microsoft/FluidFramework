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
    gcTreeKey,
    IAckedSummary,
    IContainerRuntimeOptions,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import {
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { getGCStateFromSummary, loadSummarizer, TestDataObject, submitAndAckSummary } from "./mockSummarizerClient";

/**
 * Validates that when GC is disabled on a document that had run GC previously, the GC state is removed from summary
 * and all data stores are marked as referenced.
 * This validates scenarios where due to some bug the GC state in summary is incorrect and we need to quickly recover
 * documents. Disabling GC will ensure that we are not deleting / marking things unreferenced incorrectly.
 */
describeFullCompat("GC state reset in summaries", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const defaultRuntimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
    };

    const logger = new TelemetryNullLogger();
    const dataStoreAttributesBlobName = ".component";

    // Stores the latest summary uploaded to the server.
    let latestUploadedSummary: ISummaryTree | undefined;
    // Stores the latest summary context uploaded to the server.
    let latestSummaryContext: ISummaryContext | undefined;
    // Stores the latest acked summary for the document.
    let latestAckedSummary: IAckedSummary | undefined;

    let mainContainer: IContainer;

    /** Creates a new container with the GC enabled / disabled as per gcAllowed param. */
    const createContainer = async (gcAllowed?: boolean): Promise<IContainer> => {
        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            undefined,
            { ...defaultRuntimeOptions, gcOptions: { gcAllowed, writeDataAtRoot: true } },
        );
        return provider.createContainer(runtimeFactory);
    };

    /** Loads a summarizer client with the given version (if any). Also enables / disables GC as per disableGC param. */
    const getNewSummarizer = async (disableGC: boolean, gcAllowed?: boolean, summaryVersion?: string) => {
        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            undefined,
            { ...defaultRuntimeOptions, gcOptions: { gcAllowed, disableGC, writeDataAtRoot: true } },
        );
        return loadSummarizer(
            provider, runtimeFactory, mainContainer.deltaManager.lastSequenceNumber, summaryVersion);
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

    /** Generates a summary and returns the data store channel sub-tree */
    async function getSummaryChannelsTree(
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
     * Validates that GC ran by asserting that the summary has GC blob.
     * If unreferencedDataStoreId is provided, all node entries for that data store and its children in the GC blob
     * should have unreferenced timestamp. Also, the data store's summary tree should be marked unreferenced.
     * All other nodes should be referenced and should not have unreferenced timestamp.
     */
    async function validateGCRan(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
        unreferencedDataStoreId?: string,
    ) {
        const channelsTree = await getSummaryChannelsTree(summarizerClient);
        assert(latestUploadedSummary !== undefined, "Did not get a summary");

        const gcState = getGCStateFromSummary(latestUploadedSummary);
        for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
            // All nodes belonging to the data store with id unreferencedDataStoreId should have unreferenced timestamp.
            // All other nodes should not have unreferenced timestamp.
            if (unreferencedDataStoreId !== undefined && nodeId.startsWith(`/${unreferencedDataStoreId}`)) {
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

        for (const [ id, summaryObject ] of Object.entries(channelsTree)) {
            // Filter out non data store entries.
            if (summaryObject.type !== SummaryType.Tree
                || summaryObject.tree[dataStoreAttributesBlobName] === undefined) {
                continue;
            }

            if (id === unreferencedDataStoreId) {
                assert(summaryObject.unreferenced === true, `DataStore ${id} should be unreferenced`);
            } else {
                assert(summaryObject.unreferenced !== true, `DataStore ${id} should be referenced`);
            }
        }
    }

    /**
     * Validates that GC did not run by asserting that the summary does not have GC blob.
     * All data stores should be referenced.
     */
    async function validateGCDidNotRun(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
    ) {
        const channelsTree = await getSummaryChannelsTree(summarizerClient);
        assert(latestUploadedSummary !== undefined, "Did not get a summary");
        const gcSummaryTree = latestUploadedSummary.tree[gcTreeKey];
        assert(gcSummaryTree === undefined, `GC tree should not be present in summary if GC did not run.`);

        for (const [ id, summaryObject ] of Object.entries(channelsTree)) {
            // Filter out non data store entries.
            if (summaryObject.type !== SummaryType.Tree
                || summaryObject.tree[dataStoreAttributesBlobName] === undefined) {
                continue;
            }
            assert(summaryObject.unreferenced !== true, `DataStore ${id} should be referenced`);
        }
    }

    before(function() {
        provider = getTestObjectProvider();
        // These tests validate the end-to-end behavior of summaries when GC is enabled / disabled. This behavior
        // is not affected by the service. So, it doesn't need to run against real services.
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    beforeEach(async () => {
        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
        // time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );
    });

    afterEach(() => {
        latestAckedSummary = undefined;
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    it("removes GC state and marks all objects as referenced on disabling GC", async () => {
        // Create a document with GC enabled.
        mainContainer = await createContainer(true /* gcAllowed */);
        const mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        await provider.ensureSynchronized();

        const summarizerClient = await getNewSummarizer(false /* disableGC */);

        // Mark the second data store as referenced by storing its handle in a referenced DDS.
        const newDataStore = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that GC ran.
        await validateGCRan(summarizerClient);

        // Mark the data store as unreferenced by deleting its handle from the DDS. Validate that GC ran and the
        // unreferenced data store is marked as such in GC state.
        mainDataStore._root.delete("newDataStore");
        await validateGCRan(summarizerClient, newDataStore.id);

        // Load a new summarizer from the last summary with GC disabled. Validate that GC did not run and that
        // previous GC state is removed expect for used routes which marks all data stores as referenced.
        assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
        const summarizerClient2 = await getNewSummarizer(
            true /* disableGC */,
            undefined /* gcAllowed */,
            latestAckedSummary.summaryAck.contents.handle,
        );
        await validateGCDidNotRun(summarizerClient2);
    });

    it("keeps GC enabled throughout the lifetime of a document", async () => {
        // Create a document with GC enabled.
        mainContainer = await createContainer(true /* gcAllowed */);
        const mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        await provider.ensureSynchronized();

        // Get a new summarizer that sets gcAllowed option to false.
        const summarizerClient = await getNewSummarizer(false /* gcAllowed */, false /* disableGC */);

        // Mark the second data store as referenced by storing its handle in a referenced DDS.
        const newDataStore = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that GC ran even though gcAllowed was set to false. Whether GC runs or not is determined by the
        // gcAllowed flag when the document was created.
        await validateGCRan(summarizerClient);
    });

    it("keeps GC disabled throughout the lifetime of a document", async () => {
        // Create a document with GC disabled.
        mainContainer = await createContainer(false /* gcAllowed */);
        const mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        await provider.ensureSynchronized();

        // Get a new summarizer that sets gcAllowed option to true.
        const summarizerClient = await getNewSummarizer(true /* gcAllowed */, false /* disableGC */);

        // Mark the second data store as referenced by storing its handle in a referenced DDS.
        const newDataStore = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that GC did not run even though gcAllowed is set to ture. Whether GC runs or not is determined by
        // the gcAllowed flag when the document was created.
        await validateGCDidNotRun(summarizerClient);
    });
});
