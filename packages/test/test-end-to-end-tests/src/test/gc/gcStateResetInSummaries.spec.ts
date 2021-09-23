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
import { channelsTreeName, IGarbageCollectionSummaryDetails } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { loadSummarizer, TestDataObject, submitAndAckSummary } from "./mockSummarizerClient";

describeFullCompat("GC state reset in summaries", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const defaultRuntimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { generateSummaries: false },
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
            { ...defaultRuntimeOptions, gcOptions: { gcAllowed } },
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
            { ...defaultRuntimeOptions, gcOptions: { gcAllowed, disableGC } },
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
     * Validates that GC ran by asserting that all data stores have GC state. Also, the data store whose id is
     * unreferencedDataStoreId is marked as unreferenced as per the GC state.
     */
    async function validateGCRan(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
        unreferencedDataStoreId?: string,
    ) {
        // Keeps track of whether we processed at least one data store.
        let dataStoreProcessed = false;

        const channelsTree = await getSummaryChannelsTree(summarizerClient);
        for (const [ id, summaryObject ] of Object.entries(channelsTree)) {
            // Filter out non data store entries.
            if (summaryObject.type !== SummaryType.Tree
                || summaryObject.tree[dataStoreAttributesBlobName] === undefined) {
                continue;
            }

            dataStoreProcessed = true;
            const gcBlob = summaryObject.tree.gc;
            assert(gcBlob?.type === SummaryType.Blob, `DataStore ${id} should have GC blob`);

            const gcSummaryDetails = JSON.parse(gcBlob.content as string) as IGarbageCollectionSummaryDetails;
            assert(gcSummaryDetails.gcData !== undefined, `DataStore ${id} should have GC data`);
            assert(gcSummaryDetails.usedRoutes !== undefined, `DataStore ${id} should have used routes`);

            if (id === unreferencedDataStoreId) {
                assert(summaryObject.unreferenced === true, `DataStore ${id} should be unreferenced`);
                assert(gcSummaryDetails.unrefTimestamp !== undefined, `DataStore ${id} should have unref timestamp`);
                assert(
                    !gcSummaryDetails.usedRoutes.includes("") && !gcSummaryDetails.usedRoutes.includes("/"),
                    `DataStore ${id} should not be in use`);
            } else {
                assert(summaryObject.unreferenced !== true, `DataStore ${id} should be referenced`);
                assert(gcSummaryDetails.unrefTimestamp === undefined, `DataStore ${id} shouldn't have unref timestamp`);
                assert(
                    gcSummaryDetails.usedRoutes.includes("") || gcSummaryDetails.usedRoutes.includes("/"),
                    `DataStore ${id} should be in use`,
                );
            }
        }
        assert(dataStoreProcessed, "The summary did not contain any data store entry");
    }

    /**
     * Validates that GC did not run by asserting that no data store has GC state. They should only have used routes in
     * GC blob that contains self route.
     */
    async function validateGCDidNotRun(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
    ) {
        // Keeps track of whether we processed at least one data store.
        let dataStoreProcessed = false;

        const channelsTree = await getSummaryChannelsTree(summarizerClient);
        for (const [ id, summaryObject ] of Object.entries(channelsTree)) {
            // Filter out non data store entries.
            if (summaryObject.type !== SummaryType.Tree
                || summaryObject.tree[dataStoreAttributesBlobName] === undefined) {
                continue;
            }

            dataStoreProcessed = true;

            const gcBlob = summaryObject.tree.gc;
            assert(gcBlob?.type === SummaryType.Blob, `Data store ${id} does not have GC blob`);

            const gcSummaryDetails = JSON.parse(gcBlob.content as string) as IGarbageCollectionSummaryDetails;
            assert(gcSummaryDetails.gcData === undefined, `DataStore ${id} should have GC data`);
            assert(gcSummaryDetails.unrefTimestamp === undefined, `DataStore ${id} shouldn't have unref timestamp`);
            assert.deepStrictEqual(gcSummaryDetails.usedRoutes, [""], `DataStore ${id} should only have self route`);
        }
        assert(dataStoreProcessed, "The summary did not contain any data store entry");
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
