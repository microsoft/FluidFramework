/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObjectFactory } from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    IContainer,
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
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
import { loadSummarizer, TestDataObject, submitAndAckSummary } from "../mockSummarizerClient";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";

/**
 * Runtime factory that increments the current GC version of the container runtime it creates. This is used to simulate
 * scenario where the GC version upgrades and we have to regenerate the GC data and summary.
 */
class ContainerRuntimeFactoryWithGC extends ContainerRuntimeFactoryWithDefaultDataStore {
    public async instantiateRuntime(
        context: IContainerContext,
    ): Promise<IRuntime> {
        const runtime = await super.instantiateRuntime(context);
        // A hack to update the currentGCVersion.
        (runtime as any).garbageCollector.currentGCVersion += 1;
        return runtime;
    }
}

/**
 * Validates that when the runtime GC version changes, we re-run GC and summary. Basically, when we update the GC
 * version due to either bugs or changes in the implementation, we re-run GC and regenerate summary based on the
 * new GC code.
 */
describeFullCompat("GC version upgrade", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
        gcOptions: { gcAllowed: true },
    };

    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);

    const defaultRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
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
    let dataStore1Id: string;
    let dataStore2Id: string;
    let dataStore3Id: string;

    const createContainer = async (runtimeFactory: IRuntimeFactory): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    const getNewSummarizer = async (runtimeFactory: IRuntimeFactory, summaryVersion?: string) => {
        return loadSummarizer(provider, runtimeFactory, mainContainer.deltaManager.lastSequenceNumber, summaryVersion);
    };

    /**
     * Generates a summary and validates that the data store's summary is of correct type - tree or handle.
     * The data stores ids in dataStoresAsHandles should have their summary as handles. All other data stores
     * should have their summary as tree.
     * @param containerRuntime - The mainContainer runtime to use to generate the summary.
     * @param summaryCollection - The summary collection to use to wait for a summary ack.
     * @param dataStoresAsHandles - List of data stores whose summary should be handles.
     */
    async function validateDataStoreSummaryState(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
        dataStoresAsHandles: string[],
    ) {
        const summaryResult = await submitAndAckSummary(provider, summarizerClient, logger);
        latestAckedSummary = summaryResult.ackedSummary;

        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );
        assert(latestUploadedSummary !== undefined, "Did not get a summary");

        const dataStoreTrees =
            (latestUploadedSummary.tree[channelsTreeName] as ISummaryTree)?.tree ?? latestUploadedSummary.tree;
        for (const [key, value] of Object.entries(dataStoreTrees)) {
            if (dataStoresAsHandles.includes(key)) {
                assert(value.type === SummaryType.Handle, `The summary for data store ${key} should be a handle`);
            } else {
                assert(value.type === SummaryType.Tree, `The summary for data store ${key} should be a tree`);
            }
        }
    }

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

    beforeEach(async () => {
        provider = getTestObjectProvider();
        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
        // time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );

        mainContainer = await createContainer(defaultRuntimeFactory);
        const dataStore1 = await requestFluidObject<TestDataObject>(mainContainer, "default");
        dataStore1Id = dataStore1.id;

        // Create couple more data stores and mark them as referenced.
        const dataStore2 = await factory.createInstance(dataStore1.containerRuntime);
        dataStore1._root.set("dataStore2", dataStore2.handle);
        const dataStore3 = await factory.createInstance(dataStore1.containerRuntime);
        dataStore1._root.set("dataStore3", dataStore3.handle);
        dataStore2Id = dataStore2.id;
        dataStore3Id = dataStore3.id;

        await provider.ensureSynchronized();
    });

    afterEach(() => {
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
        latestAckedSummary = undefined;
    });

    it("should regenerate summary and GC data when GC version updates", async () => {
        // Stores the ids of data stores whose summary tree should be handles.
        let dataStoresAsHandles: string[] = [];

        // Load a summarizer client.
        const summarizerClient1 = await getNewSummarizer(defaultRuntimeFactory);

        // Generate a summary and validate that all data store summaries are trees.
        await validateDataStoreSummaryState(summarizerClient1, dataStoresAsHandles);

        // Generate another summary in which the summaries for all data stores are handles.
        dataStoresAsHandles.push(dataStore1Id, dataStore2Id, dataStore3Id);
        await validateDataStoreSummaryState(summarizerClient1, dataStoresAsHandles);

        // Create a ContainerRuntimeFactoryWithGC which creates mainContainer runtime with an incremented GC version.
        const gcRuntimeFactory = new ContainerRuntimeFactoryWithGC(
            factory,
            [
                [factory.type, Promise.resolve(factory)],
            ],
            undefined,
            [innerRequestHandler],
            runtimeOptions,
        );

        assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
        // Load a new summarizer with a new GC version and the latest summary that has been generated.
        const summarizerClient2 =
            await getNewSummarizer(gcRuntimeFactory, latestAckedSummary.summaryAck.contents.handle);

        // Validate that there aren't any handles in the summary generated by the new mainContainer runtime since the
        // GC version got updated.
        dataStoresAsHandles = [];
        await validateDataStoreSummaryState(summarizerClient2, dataStoresAsHandles);

    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);

    it("should regenerate summary and GC data on receiving ack with different GC version", async () => {
        // Stores the ids of data stores whose summary tree should be handles.
        const dataStoresAsHandles: string[] = [];

        // Load a summarizer client.
        const summarizerClient1 = await getNewSummarizer(defaultRuntimeFactory);

        // Generate a summary and validate that all data store summaries are trees.
        await validateDataStoreSummaryState(summarizerClient1, dataStoresAsHandles);

        // Create a ContainerRuntimeFactoryWithGC which creates mainContainer runtime with an incremented GC version.
        const gcRuntimeFactory = new ContainerRuntimeFactoryWithGC(
            factory,
            [
                [factory.type, Promise.resolve(factory)],
            ],
            undefined,
            [innerRequestHandler],
            runtimeOptions,
        );

        assert(latestAckedSummary !== undefined, "Summary ack isn't available as expected");
        // Load a new summarizer with the above runtime factory and the latest summary that has been generated.
        const summarizerClient2 =
            await getNewSummarizer(gcRuntimeFactory, latestAckedSummary.summaryAck.contents.handle);
        // Validate that there aren't any handles in the summary generated by the new mainContainer runtime since the
        // GC version got updated.
        await validateDataStoreSummaryState(summarizerClient2, dataStoresAsHandles);

        // Now, update the the old mainContainer runtime (with old GC version) with an ack that has new GC version. This
        // simulates the scenario where an ack is received for a summary that was generated by a client running with a
        // different GC version.
        await summarizerClient1.containerRuntime.refreshLatestSummaryAck(
            latestAckedSummary.summaryOp.contents.handle,
            latestAckedSummary.summaryAck.contents.handle,
            latestAckedSummary.summaryOp.referenceSequenceNumber,
            logger,
        );

        // Validate that there aren't any handles in the summary generated by the old mainContainer runtime since we
        // will regenerate the GC data and summary.
        await validateDataStoreSummaryState(summarizerClient1, dataStoresAsHandles);

    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);
});
