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
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import {
    loadSummarizer,
    TestDataObject,
    submitAndAckSummary,
    FailingSubmitSummaryStage,
    submitFailingSummary,
} from "../mockSummarizerClient";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";
import { mockConfigProvider } from "./mockConfigProivder";

/**
 * Validates whether or not a GC Tree Summary Handle should be written to the summary.
 */
describeNoCompat("GC Tree stored as a handle in summaries", (getTestObjectProvider) => {
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
    let summarizerClient1: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; };
    let dataStoreA: TestDataObject;
    let dataStoreB: TestDataObject;
    let dataStoreC: TestDataObject;

    const isTreeHandle = true;
    const isTree = false;

    const settings = {
        "Fluid.GarbageCollection.TrackGCState": "true",
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
    async function submitSummaryAndValidateState(
        summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
        isHandle: boolean,
    ): Promise<string> {
        const summaryResult = await submitAndAckSummary(provider,
            summarizerClient,
            logger,
            false, // fullTree
        );
        latestAckedSummary = summaryResult.ackedSummary;
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );

        assert(latestUploadedSummary !== undefined, "Did not get a summary");
        const gcObject = (latestUploadedSummary.tree[gcTreeKey]);

        if (isHandle) {
            assert(gcObject.type === SummaryType.Handle, "Expected a gc handle!");
        } else {
            assert(gcObject.type === SummaryType.Tree, "Expected a gc blob!");
        }

        return latestAckedSummary.summaryAck.contents.handle;
    }

    describe("Stores handle in summary when GC state does not change", () => {
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

            summarizerClient1 = await getNewSummarizer();

            // Create data stores B and C, and mark them as referenced.
            dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            await provider.ensureSynchronized();

            // A gc blob should be submitted as this is the first summary
            await submitSummaryAndValidateState(summarizerClient1, isTree);
        });

        afterEach(() => {
            latestAckedSummary = undefined;
            latestSummaryContext = undefined;
            latestUploadedSummary = undefined;
        });

        it("Stores handle when data store changes, but no handles are modified", async () => {
            // Load a new summarizerClient from the full GC tree
            const summarizerClient2 = await getNewSummarizer();
            const tree1 = await summarizerClient1.containerRuntime.storage.getSnapshotTree()[gcTreeKey];
            const tree2 = await summarizerClient2.containerRuntime.storage.getSnapshotTree()[gcTreeKey];
            assert.deepEqual(tree2, tree1, "GC trees between containers should be the same!");

            // Make a change in dataStoreA.
            dataStoreA._root.set("key", "value");

            // Summarize and validate that a GC blob handle is generated.
            const summaryVersion = await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

            // Load a new summarizerClient
            const summarizerClient3 = await getNewSummarizer(summaryVersion);

            // Summarize on a new summarizer client and validate that a GC blob handle is generated.
            await submitSummaryAndValidateState(summarizerClient3, isTreeHandle);
            const tree3 = await summarizerClient1.containerRuntime.storage.getSnapshotTree()[gcTreeKey];
            const tree4 = await summarizerClient3.containerRuntime.storage.getSnapshotTree()[gcTreeKey];
            assert.deepEqual(tree2, tree3, "GC trees with handles should be the same!");
            assert.deepEqual(tree3, tree4, "GC trees between containers should be the regardless of handle!");
        });

        it("New gc blobs are submitted when handles are added and deleted", async () => {
            // Make a change in dataStoreA.
            dataStoreA._root.set("key", "value");

            // A gc blob handle should be submitted as there are no gc changes
            await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

            // A new gc blob should be submitted as there is a deleted gc reference
            dataStoreA._root.delete("dataStoreC");

            // Summarize and validate that all data store entries are trees since a datastore reference has changed.
            await submitSummaryAndValidateState(summarizerClient1, isTree);

            // A gc blob handle should be submitted as there are no gc changes
            await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

            // Add a handle reference to dataStore C
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);
            // A new gc blob should be submitted as there is a new gc reference
            await submitSummaryAndValidateState(summarizerClient1, isTree);
        });

        it("GC blob handle written when summary fails", async () => {
            // Make a change in dataStoreA.
            dataStoreA._root.set("key", "value");

            // A gc blob handle should be submitted as there are no gc changes
            await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

            await submitFailingSummary(provider, summarizerClient1, logger, FailingSubmitSummaryStage.Generate);

            // GC blob handle expected
            await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);
        });

        it("GC blob written when summary fails", async () => {
            // Make a reference change by deleting a handle
            dataStoreA._root.delete("dataStoreB");

            await provider.ensureSynchronized();

            await submitFailingSummary(provider, summarizerClient1, logger, FailingSubmitSummaryStage.Upload);

            // GC blob expected as the summary had changed
            await submitSummaryAndValidateState(summarizerClient1, isTree);
        });

        it("GC blob handle written when new summarizer loaded from last summary summarizes", async () => {
            await submitSummaryAndValidateState(summarizerClient1, isTreeHandle);

            await provider.ensureSynchronized();

            // Make a reference change by deleting a handle
            dataStoreA._root.delete("dataStoreB");

            await submitFailingSummary(provider, summarizerClient1, logger, FailingSubmitSummaryStage.Generate);

            // GC blob expected as the summary had changed
            const summaryVersion: string = await submitSummaryAndValidateState(summarizerClient1, isTree);

            const summarizerClient2 = await getNewSummarizer(summaryVersion);

            // GC blob expected to be the same as the summary has not changed
            await submitSummaryAndValidateState(summarizerClient2, isTreeHandle);
        });
    });

    describe("Stores handle in summary when GC state does not change", () => {
        it("Rewrites blob when data is not at root", async () => {
            provider = getTestObjectProvider();
            // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
            // time the summarizer client uploads a summary.
            (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
                provider.documentServiceFactory,
                uploadSummaryCb,
            );
            mainContainer = await createContainer();
            dataStoreA = await requestFluidObject<TestDataObject>(mainContainer, "default");

            // Create data stores B and C, and mark them as referenced.
            dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            settings["Fluid.GarbageCollection.WriteDataAtRoot"] = "false";
            summarizerClient1 = await getNewSummarizer();
            const summaryResult = await submitAndAckSummary(provider,
                summarizerClient1,
                logger,
                false, // fullTree
            );
            assert(latestUploadedSummary !== undefined, "Did not get a summary");
            assert(latestUploadedSummary.tree[gcTreeKey] === undefined, "Expected gc not to be written at root!");

            // Write data at root
            settings["Fluid.GarbageCollection.WriteDataAtRoot"] = "true";
            const summarizerClient2 = await getNewSummarizer(summaryResult.ackedSummary.summaryAck.contents.handle);
            await submitSummaryAndValidateState(summarizerClient2, isTree);
        });

        afterEach(() => {
            latestAckedSummary = undefined;
            latestSummaryContext = undefined;
            latestUploadedSummary = undefined;
        });
    });
});
