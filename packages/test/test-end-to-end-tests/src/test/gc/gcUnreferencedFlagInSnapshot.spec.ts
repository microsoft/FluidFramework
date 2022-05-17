/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObjectFactory } from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { Container } from "@fluidframework/container-loader";
import {
    ContainerRuntime,
    IAckedSummary,
    IContainerRuntimeOptions,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { loadSummarizer, TestDataObject, submitAndAckSummary } from "../mockSummarizerClient";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";

/**
 * Validates that the 'unreferenced' property in the summary tree of unreferenced data stores is present
 * as expected in the snapshot downloaded from server. Basically, the 'unreferenced' property is preserved
 * across summary upload and download.
 */
describeFullCompat("GC unreferenced flag in downloaded snapshot", (getTestObjectProvider) => {
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
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [
            [factory.type, Promise.resolve(factory)],
        ],
        undefined,
        undefined,
        runtimeOptions,
    );

    const logger = new TelemetryNullLogger();
    let mainContainer: Container;
    let mainDataStore: TestDataObject;
    let documentStorage: IDocumentStorageService;

    let latestUploadedSummary: ISummaryTree | undefined;
    let latestSummaryContext: ISummaryContext | undefined;
    // Stores the latest acked summary for the document.
    let latestAckedSummary: IAckedSummary | undefined;

    const createContainer = async (): Promise<Container> => {
        return await provider.createContainer(runtimeFactory) as Container;
    };

    const getNewSummarizer = async () => {
        return loadSummarizer(provider, runtimeFactory, mainContainer.deltaManager.lastSequenceNumber);
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
     * Validates that the unreferenced flag for data stores is correct in the summary that is uploaded to the server.
     * Also, downloads this snapshot from the server and validates that the unreferenced flag is correc in it too.
     * @param summarySequenceNumber - The sequence number when the summary was uploaded by the client.
     * @param unreferencedDataStoreIds - The ids of data stores that should be marked as unreferenced.
     * @param summaryVersion - The version of the summary that got uploaded to be used to download it from the server.
     */
    async function validateUnreferencedFlag(
        summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
        unreferencedDataStoreIds: string[],
    ) {
        const summaryResult = await submitAndAckSummary(provider, summarizerClient, logger);
        latestAckedSummary = summaryResult.ackedSummary;
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summaryResult.summarySequenceNumber,
            `Did not get expected summary. Expected: ${summaryResult.summarySequenceNumber}. ` +
            `Actual: ${latestSummaryContext?.referenceSequenceNumber}.`,
        );
        assert(latestUploadedSummary !== undefined, "Did not get a summary");

        // Validate the summary uploaded to the server
        {
            const dataStoreTrees =
                (latestUploadedSummary.tree[channelsTreeName] as ISummaryTree)?.tree ?? latestUploadedSummary.tree;
            for (const [key, value] of Object.entries(dataStoreTrees)) {
                // The data store's summary will be a handle if it did not change since last summary. If so, ignore it.
                if (value.type === SummaryType.Tree) {
                    if (unreferencedDataStoreIds.includes(key)) {
                        assert(value.unreferenced, `Data store ${key} should be marked as unreferenced in summary`);
                    } else {
                        assert(
                            value.unreferenced === undefined,
                            `Data store ${key} should not be marked as unreferenced in summary`,
                        );
                    }
                }
            }
        }

        // Validate the snapshot downloaded from the server.
        {
            // Download the snapshot corresponding to the above summary from the server.
            const versions = await documentStorage.getVersions(latestAckedSummary.summaryAck.contents.handle, 1);
            const snapshot = await documentStorage.getSnapshotTree(versions[0]);
            assert(snapshot !== null, "Snapshot could not be downloaded from server");
            const dataStoreTrees = snapshot.trees[channelsTreeName]?.trees ?? snapshot.trees;
            for (const [key, value] of Object.entries(dataStoreTrees)) {
                if (unreferencedDataStoreIds.includes(key)) {
                    assert(value.unreferenced, `Data store ${key} should be marked as unreferenced in snapshot`);
                } else {
                    assert(
                        value.unreferenced === undefined,
                        `Data store ${key} should not be marked as unreferenced in snapshot`,
                    );
                }
            }
        }
    }

    before(function() {
        provider = getTestObjectProvider();
        // Currently, only ODSP returns back the "unreferenced" flag in the snapshot. Once we add this to other
        // servers, we should enable these tests for them too.
        if (provider.driver.type !== "odsp") {
            this.skip();
        }
    });

    beforeEach(async function() {
        // GitHub issue: #9534
        if (provider.driver.type === "odsp") {
            this.skip();
        }
        // Wrap the document service factory in the driver so that the `uploadSummaryCb` function is called every
        // time the summarizer client uploads a summary.
        (provider as any)._documentServiceFactory = wrapDocumentServiceFactory(
            provider.documentServiceFactory,
            uploadSummaryCb,
        );

        mainContainer = await createContainer();
        assert(mainContainer.storage !== undefined, "Container does not have storage service");
        documentStorage = mainContainer.storage;

        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");

        await provider.ensureSynchronized();
    });

    afterEach(() => {
        latestAckedSummary = undefined;
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    it("should return the unreferenced flag correctly in snapshot for deleted data stores", async () => {
        const deletedDataStoreIds: string[] = [];
        const summarizerClient = await getNewSummarizer();

        // Create couple of data stores.
        const dataStore2 = await factory.createInstance(mainDataStore.containerRuntime);
        const dataStore3 = await factory.createInstance(mainDataStore.containerRuntime);

        // Add the handles of the above dataStores to mark them as referenced.
        {
            mainDataStore._root.set("dataStore2", dataStore2.handle);
            mainDataStore._root.set("dataStore3", dataStore3.handle);

            // Wait for the summary that contains the above. Also, get this summary's version so that we can download
            // it from the server.
            await validateUnreferencedFlag(summarizerClient, deletedDataStoreIds);
        }

        // Remove one of the data store handle to mark it as unreferenced.
        {
            mainDataStore._root.delete("dataStore2");
            deletedDataStoreIds.push(dataStore2.id);

            // Wait for the summary that contains the above. Also, get this summary's version so that we can download
            // it from the server.
            await validateUnreferencedFlag(summarizerClient, deletedDataStoreIds);
        }

        // Remove the other data store handle so that both data stores are marked as unreferenced.
        {
            mainDataStore._root.delete("dataStore3");
            deletedDataStoreIds.push(dataStore3.id);

            // Wait for the summary that contains the above. Also, get this summary's version so that we can load
            // a new container with it.
            await validateUnreferencedFlag(summarizerClient, deletedDataStoreIds);
        }
    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);

    it("should return the unreferenced flag correctly in snapshot for revived data stores", async () => {
        let deletedDataStoreIds: string[] = [];
        const summarizerClient = await getNewSummarizer();

        // Create couple of data stores.
        const dataStore2 = await factory.createInstance(mainDataStore.containerRuntime);
        const dataStore3 = await factory.createInstance(mainDataStore.containerRuntime);

        // Add the handles of the above dataStores to mark them as referenced.
        {
            mainDataStore._root.set("dataStore2", dataStore2.handle);
            mainDataStore._root.set("dataStore3", dataStore3.handle);

            console.log("waiting for summary 1");

            // Wait for the summary that contains the above. Also, get this summary's version so that we can download
            // it from the server.
            await validateUnreferencedFlag(summarizerClient, deletedDataStoreIds);
        }

        // Remove the handles of the data stores to mark them as unreferenced.
        {
            mainDataStore._root.delete("dataStore2");
            mainDataStore._root.delete("dataStore3");
            deletedDataStoreIds.push(dataStore2.id);
            deletedDataStoreIds.push(dataStore3.id);

            console.log("waiting for summary 2");

            // Wait for the summary that contains the above. Also, get this summary's version so that we can download
            // it from the server.
            await validateUnreferencedFlag(summarizerClient, deletedDataStoreIds);
        }

        // Add the handles of the data stores back to mark them as referenced again.
        {
            mainDataStore._root.set("dataStore2", dataStore2.handle);
            mainDataStore._root.set("dataStore3", dataStore3.handle);
            deletedDataStoreIds = [];

            console.log("waiting for summary 3");

            // Wait for the summary that contains the above. Also, get this summary's version so that we can load
            // a new container with it.
            await validateUnreferencedFlag(summarizerClient, deletedDataStoreIds);

            console.log("waiting for summary done");
        }
    // This test has increased timeout because it waits for multiple summaries to be uploaded to server. It then also
    // waits for those summaries to be ack'd. This may take a while.
    }).timeout(20000);
});
