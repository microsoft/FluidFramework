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
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { channelsTreeName, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { loadSummarizer, TestDataObject, submitAndAckSummary } from "../mockSummarizerClient";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";

/**
 * Validates that unchanged Fluid objects are not resummarized again. Basically, only objects that have changed since
 * the previous summary should be resummarized and for the rest, we add handles that refer to the previous summary.
 * A Fluid object is considered changed since the last summary if either or both of the following is true:
 * - It received an op.
 * - Its reference state changed, i.e., it was referenced and became unreferenced or vice-versa.
 */
describeNoCompat("GC resummarization state", (getTestObjectProvider) => {
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

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    const getNewSummarizer = async (summaryVersion?: string) => {
        return loadSummarizer(
            provider,
            runtimeFactory,
            mainContainer.deltaManager.lastSequenceNumber,
            summaryVersion,
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
        changedDataStoreIds: string[] = [],
    ) {
        const summaryResult = await submitAndAckSummary(provider, summarizerClient, logger, false /* fullTree */);
        latestAckedSummary = summaryResult.ackedSummary;
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );

        assert(latestUploadedSummary !== undefined, "Did not get a summary");
        const channelsTree = (latestUploadedSummary.tree[channelsTreeName] as ISummaryTree).tree;
        for (const [id, summaryObject] of Object.entries(channelsTree)) {
            if (changedDataStoreIds.includes(id)) {
                assert(summaryObject.type === SummaryType.Tree, `Data store ${id}'s entry should be a tree`);
            } else {
                assert(summaryObject.type === SummaryType.Handle, `Data store ${id}'s entry should be a handle`);
            }
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

    describe("resummarization state in summary", () => {
        it("only resummarizes changed data stores", async () => {
            const summarizerClient1 = await getNewSummarizer();

            // Create data stores B and C, and mark them as referenced.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // Summarize and validate that all data store entries are trees since this is the first summary.
            await validateResummaryState(summarizerClient1, [dataStoreA.id, dataStoreB.id, dataStoreC.id]);

            // Make a change in dataStoreA.
            dataStoreA._root.set("key", "value");

            // Summarize and validate that dataStoreA's entry is a tree and rest of the data store entries are handles.
            await validateResummaryState(summarizerClient1, [dataStoreA.id]);

            // Summarize again and validate that all data store entries are trees since none of them changed.
            await validateResummaryState(summarizerClient1, []);
        });

        it("only resummarizes changed data stores across multiple summarizer clients", async () => {
            const summarizerClient1 = await getNewSummarizer();

            // Create data stores B and C, and mark them as referenced.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // Validate that all data store entries are trees since this is the first summary.
            await validateResummaryState(summarizerClient1, [dataStoreA.id, dataStoreB.id, dataStoreC.id]);

            // Load a new client from the summary generated above.
            assert(latestAckedSummary !== undefined, "Ack'd summary isn't available as expected");
            const summarizerClient2 = await getNewSummarizer(latestAckedSummary.summaryAck.contents.handle);

            // Summarize the new client and validate that all data store entries are handles since none of them changed.
            await validateResummaryState(summarizerClient2, []);

            // Make a change in dataStoreA.
            dataStoreA._root.set("key", "value");

            // Load a new client from the summary generated above.
            const summarizerClient3 = await getNewSummarizer(latestAckedSummary.summaryAck.contents.handle);

            // Summarize the new client and validate that dataStoreA's entry is a tree and rest of the data store
            // entries are handles.
            await validateResummaryState(summarizerClient3, [dataStoreA.id]);
        });

        it("resummarizes data stores whose reference state changed across summarizer clients", async () => {
            const summarizerClient1 = await getNewSummarizer();

            // Create data stores B and C, and mark them as referenced.
            const dataStoreB = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);
            const dataStoreC = await dataObjectFactory.createInstance(dataStoreA.containerRuntime);
            dataStoreA._root.set("dataStoreC", dataStoreC.handle);

            // Summarize and validate that all data store entries are trees since this is the first summary.
            await validateResummaryState(summarizerClient1, [dataStoreA.id, dataStoreB.id, dataStoreC.id]);

            // Remove the reference to dataStoreB.
            dataStoreA._root.delete("dataStoreB");

            // Summarize and validate that both dataStoreA and dataStoreB changed. dataStoreA because it has a new
            // op and dataStoreB because its reference state changed from referenced -> unreferenced.
            await validateResummaryState(summarizerClient1, [dataStoreA.id, dataStoreB.id]);

            // Load a new client from the summary generated above.
            assert(latestAckedSummary !== undefined, "Ack'd summary isn't available as expected");
            const summarizerClient2 = await getNewSummarizer(latestAckedSummary.summaryAck.contents.handle);

            // Add back the reference to dataStoreB.
            dataStoreA._root.set("dataStoreB", dataStoreB.handle);

            // Summarize the new client and validate that both dataStoreA and dataStoreB changed. dataStoreA because it
            // has a new op and dataStoreB because its reference state changed from unreferenced -> referenced.
            await validateResummaryState(summarizerClient2, [dataStoreA.id, dataStoreB.id]);

            // Load a new client from the summary generated above.
            const summarizerClient3 = await getNewSummarizer(latestAckedSummary.summaryAck.contents.handle);

            // Validate that all data store entries are handles since none of them changed.
            await validateResummaryState(summarizerClient3, []);
        });
    });
});
