/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    IContainer,
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
    LoaderHeader,
} from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    IAckedSummary,
    IContainerRuntimeOptions,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { DriverHeader, ISummaryContext } from "@fluidframework/driver-definitions";
import {
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { flattenRuntimeOptions } from "../flattenRuntimeOptions";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }
}

/**
 * Runtime factory that increments the current GC version of the container runtime it creates. This is used to simulate
 * scenario where the GC version upgrades and we have to regenerate the GC data and summary.
 */
class ContainerRuntimeFactoryWithGC extends ContainerRuntimeFactoryWithDefaultDataStore {
    public async instantiateRuntime(
        context: IContainerContext,
    ): Promise<IRuntime> {
        const runtime = await super.instantiateRuntime(context);
        (runtime as any).currentGCVersion += 1;
        return runtime;
    }
}

describeFullCompat("GC version upgrade", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            generateSummaries: false,
        },
        gcOptions: {
            gcAllowed: true,
        },
    };
    const defaultRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        flattenRuntimeOptions(runtimeOptions),
    );

    const logger = new TelemetryNullLogger();

    // Stores the latest summary uploaded to the server.
    let latestUploadedSummary: ISummaryTree | undefined;
    // Stores the latest summary context uploaded to the server.
    let latestSummaryContext: ISummaryContext | undefined;
    // Stores the latest acked summary for the document.
    let latestSummaryAck: IAckedSummary;

    let container: IContainer;
    let dataStore1Id: string;
    let dataStore2Id: string;
    let dataStore3Id: string;

    const createContainer = async (runtimeFactory: IRuntimeFactory): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    /**
     * Loads a summarizer client with the given version (if any) and returns its container runtime.
     */
    async function loadSummarizer(runtimeFactory: IRuntimeFactory, summaryVersion?: string): Promise<ContainerRuntime> {
        const requestHeader = {
            [LoaderHeader.cache]: false,
            [LoaderHeader.clientDetails]: {
                capabilities: { interactive: true },
                type: "summarizer",
            },
            [DriverHeader.summarizingClient]: true,
            [LoaderHeader.reconnect]: false,
            [LoaderHeader.sequenceNumber]: container.deltaManager.lastSequenceNumber,
            [LoaderHeader.version]: summaryVersion,
        };
        const summarizer = await provider.loadContainer(runtimeFactory, undefined /* options */, requestHeader);
        const defaultDataStore = await requestFluidObject<TestDataObject>(summarizer, "default");
        return defaultDataStore._context.containerRuntime as ContainerRuntime;
    }

    /**
     * Generates a summary and validates that the data store's summary is of correct type - tree or handle.
     * The data stores ids in dataStoresAsHandles should have their summary as handles. All other data stores
     * should have their summary as tree.
     * @param containerRuntime - The container runtime to use to generate the summary.
     * @param summaryCollection - The summary collection to use to wait for a summary ack.
     * @param dataStoresAsHandles - List of data stores whose summary should be handles.
     */
    async function validateDataStoreSummaryState(
        containerRuntime: ContainerRuntime,
        summaryCollection: SummaryCollection,
        dataStoresAsHandles: string[],
    ) {
        const summarySequenceNumber = await submitSummary(containerRuntime);
        latestSummaryAck = await summaryCollection.waitSummaryAck(summarySequenceNumber);
        await refreshSummaryAck(containerRuntime, latestSummaryAck);

        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summarySequenceNumber,
            `Did not get expected summary. Expected: ${summarySequenceNumber}. ` +
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
        if (latestSummaryAck !== undefined) {
            newSummaryContext.ackHandle = latestSummaryAck.summaryAck.contents.handle;
            newSummaryContext.proposalHandle = latestSummaryAck.summaryOp.contents.handle;
        }
        return newSummaryContext;
    }

    /**
     * Generates, uploads, and submits a summary on the given container runtime.
     * @param containerRuntime - The container runtime to use to generate the summary.
     * @returns The last sequence number contained in the summary that is generated.
     */
    async function submitSummary(containerRuntime: ContainerRuntime): Promise<number> {
        await provider.ensureSynchronized();
        const summarySequenceNumber = containerRuntime.deltaManager.lastSequenceNumber;
        await containerRuntime.submitSummary({
            fullTree: false,
            refreshLatestAck: false,
            summaryLogger: logger,
            cancellable: { cancelled: false, waitCancelled: new Promise(() => {}) },
        });
        return summarySequenceNumber;
    }

    /**
     * Updates the container runtime with the given ack.
     */
    const refreshSummaryAck = async (
        containerRuntime: ContainerRuntime,
        ackedSummary: IAckedSummary,
    ) => containerRuntime.refreshLatestSummaryAck(
        ackedSummary.summaryOp.contents.handle,
        ackedSummary.summaryAck.contents.handle,
        logger,
    );

    beforeEach(async () => {
        provider = getTestObjectProvider();
        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
        // time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );

        container = await createContainer(defaultRuntimeFactory);
        const dataStore1 = await requestFluidObject<TestDataObject>(container, "default");
        dataStore1Id = dataStore1.id;

        // Create couple more data stores and mark them as referenced.
        const dataStore2 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set("dataStore2", dataStore2.handle);
        const dataStore3 = await factory.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set("dataStore3", dataStore3.handle);
        dataStore2Id = dataStore2.id;
        dataStore3Id = dataStore3.id;

        await provider.ensureSynchronized();
    });

    afterEach(() => {
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    it("should regenerate summary and GC data when GC version updates", async () => {
        // Stores the ids of data stores whose summary tree should be handles.
        let dataStoresAsHandles: string[] = [];

        // Load a summarizer client.
        const summarizer1ContainerRuntime = await loadSummarizer(defaultRuntimeFactory);
        const summaryCollection1 = new SummaryCollection(summarizer1ContainerRuntime.deltaManager, logger);

        // Generate a summary and validate that all data store summaries are trees.
        await validateDataStoreSummaryState(summarizer1ContainerRuntime, summaryCollection1, dataStoresAsHandles);

        // Generate another summary in which the summaries for all data stores are handles.
        dataStoresAsHandles.push(dataStore1Id, dataStore2Id, dataStore3Id);
        await validateDataStoreSummaryState(summarizer1ContainerRuntime, summaryCollection1, dataStoresAsHandles);

        // Create a ContainerRuntimeFactoryWithGC which creates container runtime with an incremented GC version.
        const gcRuntimeFactory = new ContainerRuntimeFactoryWithGC(
            factory,
            [
                [factory.type, Promise.resolve(factory)],
            ],
            undefined,
            undefined,
            flattenRuntimeOptions(runtimeOptions),
        );

        // Load a new summarizer with a new GC version and the latest summary that has been generated.
        const summarizer2ContainerRuntime = await loadSummarizer(
            gcRuntimeFactory, latestSummaryAck.summaryAck.contents.handle);
        const summaryCollection2 = new SummaryCollection(summarizer2ContainerRuntime.deltaManager, logger);

        // Validate that there aren't any handles in the summary generated by the new container runtime since the
        // GC version got updated.
        dataStoresAsHandles = [];
        await validateDataStoreSummaryState(summarizer2ContainerRuntime, summaryCollection2, dataStoresAsHandles);

        // Generate another summary and validate that the summaries are not handles for the data stores.
        dataStoresAsHandles.push(dataStore1Id, dataStore2Id, dataStore3Id);
        await validateDataStoreSummaryState(summarizer2ContainerRuntime, summaryCollection2, dataStoresAsHandles);
    });

    it("should regenerate summary and GC data on receiving ack with different GC version", async () => {
        // Stores the ids of data stores whose summary tree should be handles.
        let dataStoresAsHandles: string[] = [];

        // Load a summarizer client.
        const summarizer1ContainerRuntime = await loadSummarizer(defaultRuntimeFactory);
        const summaryCollection1 = new SummaryCollection(summarizer1ContainerRuntime.deltaManager, logger);

        // Generate a summary and validate that all data store summaries are trees.
        await validateDataStoreSummaryState(summarizer1ContainerRuntime, summaryCollection1, dataStoresAsHandles);

        // Create a ContainerRuntimeFactoryWithGC which creates container runtime with an incremented GC version.
        const gcRuntimeFactory = new ContainerRuntimeFactoryWithGC(
            factory,
            [
                [factory.type, Promise.resolve(factory)],
            ],
            undefined,
            undefined,
            flattenRuntimeOptions(runtimeOptions),
        );

        // Load a new summarizer with a new GC version and the latest summary that has been generated.
        const summarizer2ContainerRuntime = await loadSummarizer(
            gcRuntimeFactory, latestSummaryAck.summaryAck.contents.handle);
        const summaryCollection2 = new SummaryCollection(summarizer2ContainerRuntime.deltaManager, logger);
        // Validate that there aren't any handles in the summary generated by the new container runtime since the
        // GC version got updated.
        await validateDataStoreSummaryState(summarizer2ContainerRuntime, summaryCollection2, dataStoresAsHandles);

        // Generate another summary and validate that the summaries are not handles for the data stores.
        dataStoresAsHandles.push(dataStore1Id, dataStore2Id, dataStore3Id);
        await validateDataStoreSummaryState(summarizer2ContainerRuntime, summaryCollection2, dataStoresAsHandles);

        // Now, update the ack for the old container runtime with old GC version with the newer GC version ack.
        await refreshSummaryAck(summarizer1ContainerRuntime, latestSummaryAck);

        // Validate that there aren't any handles in the summary generated by the old container runtime since we
        // will regenerate the GC data and summary.
        dataStoresAsHandles = [];
        await validateDataStoreSummaryState(summarizer1ContainerRuntime, summaryCollection1, dataStoresAsHandles);
    });
});
