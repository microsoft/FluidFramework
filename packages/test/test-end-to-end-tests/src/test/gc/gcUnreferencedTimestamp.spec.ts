/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    IAckedSummary,
    IContainerRuntimeOptions,
    ISummaryNackMessage,
    SummaryCollection,
    neverCancelledSummaryToken,
} from "@fluidframework/container-runtime";
import { DriverHeader, ISummaryContext } from "@fluidframework/driver-definitions";
import {
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { channelsTreeName, IGarbageCollectionSummaryDetails } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
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

// REVIEW: Enable full compat after runtime version >= 0.48.0
describeNoCompat("GC unreferenced timestamp", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
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
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
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
    let latestSummaryAck: IAckedSummary | undefined;

    let firstContainer: IContainer;
    let firstContainerRuntime: ContainerRuntime;
    let firstDataStore: TestDataObject;

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory);
    };

    /**
     * Loads a summarizer client with the given version (if any) and returns its container runtime.
     */
    async function loadSummarizer(summaryVersion?: string) {
        const requestHeader = {
            [LoaderHeader.cache]: false,
            [LoaderHeader.clientDetails]: {
                capabilities: { interactive: true },
                type: "summarizer",
            },
            [DriverHeader.summarizingClient]: true,
            [LoaderHeader.reconnect]: false,
            [LoaderHeader.sequenceNumber]: firstContainer.deltaManager.lastSequenceNumber,
            [LoaderHeader.version]: summaryVersion,
        };
        const summarizer = await provider.loadContainer(runtimeFactory, undefined /* options */, requestHeader);

        // Fail fast if we receive a nack as something must have gone wrong.
        const summaryCollection = new SummaryCollection(summarizer.deltaManager, logger);
        summaryCollection.on("summaryNack", (op: ISummaryNackMessage) => {
            throw new Error(`Received Nack for sequence#: ${op.contents.summaryProposal.summarySequenceNumber}`);
        });

        const defaultDataStore = await requestFluidObject<TestDataObject>(summarizer, "default");
        return {
            containerRuntime: defaultDataStore._context.containerRuntime as ContainerRuntime,
            summaryCollection,
        };
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
        const result = await containerRuntime.submitSummary({
            fullTree: true,
            refreshLatestAck: false,
            summaryLogger: logger,
            cancellationToken: neverCancelledSummaryToken,
        });
        assert.strictEqual(result.stage, "submit", "The summary was not submitted");
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

    /**
     * Generates a summary and returns the unreferenced timestamp for the data store with the given id in the summary.
     * If the data store is referenced, the ureferenced timestamp is undefined.
     */
    async function getDataStoreUnreferencedTimestamp(
        summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
        dataStoreId: string,
    ): Promise<number | undefined> {
        const summarySequenceNumber = await submitSummary(summarizerClient.containerRuntime);
        latestSummaryAck = await summarizerClient.summaryCollection.waitSummaryAck(summarySequenceNumber);
        await refreshSummaryAck(summarizerClient.containerRuntime, latestSummaryAck);

        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summarySequenceNumber,
            `Did not get expected summary. Expected: ${summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );
        assert(latestUploadedSummary !== undefined, "Did not get a summary");

        const channelsTree =
            (latestUploadedSummary.tree[channelsTreeName] as ISummaryTree)?.tree ?? latestUploadedSummary.tree;
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

        firstContainer = await createContainer();
        firstDataStore = await requestFluidObject<TestDataObject>(firstContainer, "default");
        firstContainerRuntime = firstDataStore._context.containerRuntime as ContainerRuntime;

        await provider.ensureSynchronized();
    });

    afterEach(() => {
        latestSummaryAck = undefined;
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    it("adds / removes unreferenced timestamp from data stores correctly", async () => {
        const summarizerClient = await loadSummarizer();

        // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
        const newDataStore = await dataObjectFactory.createInstance(firstContainerRuntime);
        firstDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that the new data store does not have unreferenced timestamp.
        const unrefTimestamp1 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

        // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
        // unreferenced timestamp.
        firstDataStore._root.delete("newDataStore");
        const unrefTimestamp2 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp2 !== undefined, `data store should have unreferenced timestamp after being unreferenced`);

        // Perform some operations and generate another summary. Validate that the data store still has the same
        // unreferenced timestamp.
        firstDataStore._root.set("key", "value");
        const unrefTimestamp3 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp3 !== undefined, `data store should still have unreferenced timestamp`);
        assert.strictEqual(unrefTimestamp2, unrefTimestamp3, "unreferenced timestamp should not have changed");

        // Mark the data store as referenced again and validate that the unreferenced timestamp is removed.
        firstDataStore._root.set("newDataStore", newDataStore.handle);
        // Validate that the data store does not have unreferenced timestamp after being referenced.
        const unrefTimestamp4 = await getDataStoreUnreferencedTimestamp(summarizerClient, newDataStore.id);
        assert(unrefTimestamp4 === undefined, `data store should not have unreferenced timestamp anymore`);
    });

    it("uses unreferenced timestamp from previous summary correctly", async () => {
        const summarizerClient1 = await loadSummarizer();

        // Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
        const newDataStore = await dataObjectFactory.createInstance(firstContainerRuntime);
        firstDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that the new data store does not have unreferenced timestamp.
        const unrefTimestamp1 = await getDataStoreUnreferencedTimestamp(summarizerClient1, newDataStore.id);
        assert(unrefTimestamp1 === undefined, `new data store should not have unreferenced timestamp`);

        // Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
        // unreferenced timestamp.
        firstDataStore._root.delete("newDataStore");
        const unrefTimestamp2 = await getDataStoreUnreferencedTimestamp(summarizerClient1, newDataStore.id);
        assert(unrefTimestamp2 !== undefined, `new data store should have unreferenced timestamp`);

        // Load a new summarizer from the last summary and validate that the unreferenced timestamp from the summary is
        // used for the data store.
        assert(latestSummaryAck !== undefined, "Summary ack isn't available as expected");
        const summarizerClient2 = await loadSummarizer(latestSummaryAck.summaryAck.contents.handle);
        const unrefTimestamp3 =
            await getDataStoreUnreferencedTimestamp(summarizerClient2, newDataStore.id);
        assert(unrefTimestamp3 !== undefined, `new data store should still have unreferenced timestamp`);
        assert.strictEqual(unrefTimestamp2, unrefTimestamp3, "The unreferenced timestamp should not have changed");
    });
});
