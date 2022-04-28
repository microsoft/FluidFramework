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
import { channelsTreeName, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { getGCStateFromSummary, loadSummarizer, TestDataObject, submitAndAckSummary } from "../mockSummarizerClient";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { mockConfigProvider } from "./mockConfigProivder";

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
    // Enable config provider setting to write GC data at the root.
    const settings = { "Fluid.GarbageCollection.WriteDataAtRoot": "true" };
    const configProvider = mockConfigProvider(settings);

    // Stores the latest summary uploaded to the server.
    let latestUploadedSummary: ISummaryTree | undefined;
    // Stores the latest summary context uploaded to the server.
    let latestSummaryContext: ISummaryContext | undefined;
    // Stores the latest acked summary for the document.
    let latestAckedSummary: IAckedSummary | undefined;

    let mainContainer: IContainer;

    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);

    /** Creates a new container with the GC enabled / disabled as per gcAllowed param. */
    const createContainer = async (gcAllowed?: boolean): Promise<IContainer> => {
        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            [innerRequestHandler],
            { ...defaultRuntimeOptions, gcOptions: { gcAllowed, writeDataAtRoot: true } },
        );
        return provider.createContainer(runtimeFactory, { configProvider });
    };

    /** Loads a summarizer client with the given version (if any). Also enables / disables GC as per disableGC param. */
    const getNewSummarizer = async (disableGC: boolean, gcAllowed?: boolean, summaryVersion?: string) => {
        const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            [innerRequestHandler],
            { ...defaultRuntimeOptions, gcOptions: { gcAllowed, disableGC, writeDataAtRoot: true } },
        );
        return loadSummarizer(
            provider,
            runtimeFactory,
            mainContainer.deltaManager.lastSequenceNumber,
            summaryVersion,
            { configProvider },
        );
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
        const summaryResult = await submitAndAckSummary(provider, summarizerClient, logger);
        latestAckedSummary = summaryResult.ackedSummary;

        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );
        assert(latestUploadedSummary !== undefined, "Did not get a summary");
        return (latestUploadedSummary.tree[channelsTreeName] as ISummaryTree).tree;
    }

    /**
     * Generated a summary for the given client and validates the GC state in the summary as per the params:
     * @param shouldGCRun - Whether GC should run or not. If true, validates that the summary contains a GC tree.
     * @param shouldRegenerateSummary - Whether the summary should be regenerated. If true, validates that all data
     * store entries in the summary are of type ISummaryTree.
     * @param unreferencedDataStoreIds - A list of data store IDs that should be unreferenced in the summary. Validates
     * that all these data store's summary tree is marked unreferenced. If shouldRunGC is true, also validates that the
     * GC state for these have an unreferenced timestamp.
     */
    async function validateGCState(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
        shouldGCRun: boolean,
        shouldRegenerateSummary: boolean,
        unreferencedDataStoreIds: string[] = [],
    ) {
        const channelsTree = await getSummaryChannelsTree(summarizerClient);
        assert(latestUploadedSummary !== undefined, "Did not get a summary");

        const gcState = getGCStateFromSummary(latestUploadedSummary);
        if (gcState === undefined) {
            assert(!shouldGCRun, `If GC tree is not present in summary, GC should not have run.`);
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

        for (const [id, summaryObject] of Object.entries(channelsTree)) {
            if (summaryObject.type !== SummaryType.Tree) {
                assert(!shouldRegenerateSummary, `DataStore ${id}'s entry should be a tree if summary was regenerated`);
                continue;
            }

            if (unreferencedDataStoreIds.includes(id)) {
                assert(summaryObject.unreferenced === true, `DataStore ${id} should be unreferenced`);
            } else {
                assert(summaryObject.unreferenced !== true, `DataStore ${id} should be referenced`);
            }
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

        // Mark the data store as unreferenced by deleting its handle from the DDS.
        mainDataStore._root.delete("newDataStore");

        // Validate that GC ran and the unreferenced data store is marked as such in GC state.
        await validateGCState(
            summarizerClient,
            true /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
            [newDataStore.id],
        );

        // Load a new summarizer from the last summary with GC disabled.
        assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
        const summarizerClient2 = await getNewSummarizer(
            true /* disableGC */,
            undefined /* gcAllowed */,
            latestAckedSummary.summaryAck.contents.handle,
        );
        // Validate that GC does not run and the summary is regenerated because GC was disabled.
        await validateGCState(
            summarizerClient2,
            false /* shouldGCRun */,
            true /* shouldRegenerateSummary */,
        );

        // Validate that GC does not run and the summary is not regenerated again. The summary is regenerated
        // only the first time GC is disabled after it was enabled before.
        await validateGCState(
            summarizerClient2,
            false /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
        );

        // Load a new summarizer from the last summary with GC still disabled.
        const summarizerClient3 = await getNewSummarizer(
            true /* disableGC */,
            undefined /* gcAllowed */,
            latestAckedSummary.summaryAck.contents.handle,
        );
        // Validate that GC does not run and the summary is not regenerated again in a new client as well. The
        // summary is regenerated only the first time GC is disabled after it was enabled before.
        await validateGCState(
            summarizerClient3,
            false /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
        );
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
        await validateGCState(
            summarizerClient,
            true /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
        );
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
        await validateGCState(
            summarizerClient,
            false /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
        );
    });
});
