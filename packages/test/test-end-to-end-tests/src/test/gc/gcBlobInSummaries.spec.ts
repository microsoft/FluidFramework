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
    gcBlobPrefix,
    gcTreeKey,
    IAckedSummary,
    IContainerRuntimeOptions,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { loadSummarizer, TestDataObject, submitAndAckSummary } from "../mockSummarizerClient";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { mockConfigProvider } from "./mockConfigProivder";

/**
 * Validates that unchanged Fluid objects are not resummarized again. Basically, only objects that have changed since
 * the previous summary should be resummarized and for the rest, we add handles that refer to the previous summary.
 * A Fluid object is considered changed since the last summary if either or both of the following is true:
 * - It received an op.
 * - Its reference state changed, i.e., it was referenced and became unreferenced or vice-versa.
 */
describeNoCompat("GC Blob stored in summaries", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory("TestDataObject", TestDataObject, [], []);
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
        gcOptions: { gcAllowed: true },
    };
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        [innerRequestHandler],
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
    let dataStoreA: TestDataObject;

    const settings = {
        "Fluid.GarbageCollection.trackGCStateKey": "true",
    };
    const configProvider = mockConfigProvider(settings);

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory, { configProvider });
    };

    const getNewSummarizer = async (summaryVersion?: string) => {
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

    /**
     * Submits a summary and validates that the data stores with ids in `changedDataStoreIds` are resummarized. All
     * other data stores are not resummarized and a handle is sent for them in the summary.
     */
    async function validateResummaryState(
        summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
        isHandle: boolean,
    ) {
        const summaryResult = await submitAndAckSummary(provider, summarizerClient, logger, false /* fullTree */);
        latestAckedSummary = summaryResult.ackedSummary;
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );

        assert(latestUploadedSummary !== undefined, "Did not get a summary");
        const gcTree = (latestUploadedSummary.tree[gcTreeKey] as ISummaryTree);
        assert(gcTree.tree !== undefined);
        const gcDataBlobKey = `${gcBlobPrefix}_root`;

        if (isHandle) {
            assert(gcTree.tree[gcDataBlobKey].type === SummaryType.Handle, "Expected a gc handle!");
        } else {
            assert(gcTree.tree[gcDataBlobKey].type === SummaryType.Blob, "Expected a gc tree!");
        }
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
        dataStoreA = await requestFluidObject<TestDataObject>(mainContainer, "default");

        await provider.ensureSynchronized();
    });

    afterEach(() => {
        latestAckedSummary = undefined;
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    describe("Stores handle in summary when GC state does not change", () => {
        const isBlobHandle = true;
        const isBlob = false;

        it("Stores handle when data store changes, but no handles are modified", async () => {
            const summarizerClient1 = await getNewSummarizer();
            const dds = SharedMap.create(dataStoreA.dataStoreRuntime);
            dataStoreA._root.set("dds", dds.handle);

            // Create data stores B and C, and mark them as referenced.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // Summarize and validate that a full GC tree is generated.
            await validateResummaryState(summarizerClient1, isBlob);

            // Load a new summarizerClient from the full GC tree
            const summarizerClient2 = await getNewSummarizer();

            // Make a change in dataStoreA.
            dataStoreA._root.set("key", "value");

            // Summarize and validate that a GC blob handle is generated.
            await validateResummaryState(summarizerClient1, isBlobHandle);

            // Load a new summarizerClient
            const summarizerClient3 = await getNewSummarizer();

            // Summarize on a new summarizer client and validate that a GC blob handle is generated.
            await validateResummaryState(summarizerClient3, isBlobHandle);
            const snapshot1 = await summarizerClient1.containerRuntime.storage.getSnapshotTree();
            const snapshot2 = await summarizerClient2.containerRuntime.storage.getSnapshotTree();
            const snapshot3 = await summarizerClient3.containerRuntime.storage.getSnapshotTree();
            assert.deepEqual(snapshot1, snapshot2, "Snapshots between containers should be the same!");
            assert.deepEqual(snapshot2, snapshot3, "Snapshots between containers should be the regardless of handle!");
        });

        it("New gc blobs are submitted when handles are added and deleted", async () => {
            const summarizerClient1 = await getNewSummarizer();

            // Create data stores B and C, and mark them as referenced.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // A gc blob should be submitted as this is the first summary
            await validateResummaryState(summarizerClient1, isBlob);

            // Make a change in dataStoreA.
            dataStoreA._root.set("key", "value");

            // A gc blob handle should be submitted as there are no gc changes
            await validateResummaryState(summarizerClient1, isBlobHandle);

            // A new gc blob should be submitted as there is a deleted gc reference
            dataStoreA._root.delete("dataStoreC");

            // Summarize and validate that all data store entries are trees since a datastore reference has changed.
            await validateResummaryState(summarizerClient1, isBlob);

            // A gc blob handle should be submitted as there are no gc changes
            await validateResummaryState(summarizerClient1, isBlobHandle);

            // Add a handle reference to dataStore C
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);
            // A new gc blob should be submitted as there is a new gc reference
            await validateResummaryState(summarizerClient1, isBlob);
        });
    });
});
