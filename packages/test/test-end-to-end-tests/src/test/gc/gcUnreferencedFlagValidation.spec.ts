/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { Container } from "@fluidframework/container-loader";
import { IAckedSummary, IContainerRuntimeOptions, SummaryCollection } from "@fluidframework/container-runtime";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
    ISummaryConfiguration,
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { wrapDocumentServiceFactory } from "./gcDriverWrappers";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }
}

describeFullCompat("GC unreferenced flag validation in snapshot", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const IdleDetectionTime = 100;
    const summaryConfigOverrides: Partial<ISummaryConfiguration> = {
        idleTime: IdleDetectionTime,
        maxTime: IdleDetectionTime * 12,
    };
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            generateSummaries: true,
            initialSummarizerDelayMs: 10,
            summaryConfigOverrides,
        },
        gcOptions: {
            gcAllowed: true,
        },
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

    let mainContainer: Container;
    let mainDataStore: TestDataObject;
    let documentStorage: IDocumentStorageService;
    let summaryCollection: SummaryCollection;

    let latestUploadedSummary: ISummaryTree | undefined;
    let latestSummaryContext: ISummaryContext | undefined;

    const createContainer = async (): Promise<Container> => {
        return await provider.createContainer(runtimeFactory) as Container;
    };

    /**
     * Waits for a summary with the current state of the document (including all in-flight changes). It basically
     * synchronizes all containers and waits for a summary that contains the last processed sequence number.
     * @returns the version of this summary that be used to download it from the server.
     */
     async function waitForSummary() {
        await provider.ensureSynchronized();
        const sequenceNumber = mainContainer.deltaManager.lastSequenceNumber;
        const ackedSummary: IAckedSummary =
            await summaryCollection.waitSummaryAck(sequenceNumber);
        return {
            summaryVersion: ackedSummary.summaryAck.contents.handle,
            sequenceNumber,
        };
    }

    /**
     * Callback that will be called by the document storage service whenever a summary is uploaded by the client.
     */
    function uploadSummaryCb(summaryTree: ISummaryTree, context: ISummaryContext): ISummaryContext {
        latestUploadedSummary = summaryTree;
        latestSummaryContext = context;
        return context;
    }

    /**
     * Validates that the unreferenced flag for data stores is correct in the summary that is uploaded to the server.
     * Also, downloads this snapshot from the server and validates that the unreferenced flag is correc in it too.
     * @param summarySequenceNumber - The sequence number when the summary was uploaded by the client.
     * @param unreferencedDataStoreIds - The ids of data stores that should be marked as unreferenced.
     * @param summaryVersion - The version of the summary that got uploaded to be used to download it from the server.
     */
    async function validateUnreferencedFlag(
        summarySequenceNumber: number,
        unreferencedDataStoreIds: string[],
        summaryVersion: string,
    ) {
        assert(
            latestSummaryContext && latestSummaryContext.referenceSequenceNumber >= summarySequenceNumber,
            `Did not get expected summary. Expected: ${summarySequenceNumber}. ` +
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
            const versions = await documentStorage.getVersions(summaryVersion, 1);
            const snapshot = await documentStorage.getSnapshotTree(versions[0]);
            // eslint-disable-next-line no-null/no-null
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

    beforeEach(async () => {
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

        // Create and setup a summary collection that will be used to track and wait for summaries.
        summaryCollection = new SummaryCollection(mainContainer.deltaManager, new TelemetryNullLogger());
    });

    afterEach(() => {
        mainContainer.close();
        provider.reset();
        latestSummaryContext = undefined;
        latestUploadedSummary = undefined;
    });

    it("should return the unreferenced flag correctly in snapshot for deleted data stores", async () => {
        const deletedDataStoreIds: string[] = [];

        // Create couple of data stores.
        const dataStore2 = await factory.createInstance(mainDataStore._context.containerRuntime);
        const dataStore3 = await factory.createInstance(mainDataStore._context.containerRuntime);

        // Add the handles of the above dataStores to mark them as referenced.
        {
            mainDataStore._root.set("dataStore2", dataStore2.handle);
            mainDataStore._root.set("dataStore3", dataStore3.handle);

            // Wait for the summary that contains the above. Also, get this summary's version so that we can download
            // it from the server.
            const summaryResult = await waitForSummary();
            await validateUnreferencedFlag(
                summaryResult.sequenceNumber,
                deletedDataStoreIds,
                summaryResult.summaryVersion,
            );
        }

        // Remove one of the data store handle to mark it as unreferenced.
        {
            mainDataStore._root.delete("dataStore2");
            deletedDataStoreIds.push(dataStore2.id);

            // Wait for the summary that contains the above. Also, get this summary's version so that we can download
            // it from the server.
            const summaryResult = await waitForSummary();
            await validateUnreferencedFlag(
                summaryResult.sequenceNumber,
                deletedDataStoreIds,
                summaryResult.summaryVersion,
            );
        }

        // Remove the other data store handle so that both data stores are marked as unreferenced.
        {
            mainDataStore._root.delete("dataStore3");
            deletedDataStoreIds.push(dataStore3.id);

            // Wait for the summary that contains the above. Also, get this summary's version so that we can load
            // a new container with it.
            const summaryResult = await waitForSummary();
            await validateUnreferencedFlag(
                summaryResult.sequenceNumber,
                deletedDataStoreIds,
                summaryResult.summaryVersion,
            );
        }
    });

    it("should return the unreferenced flag correctly in snapshot for un-deleted data stores", async () => {
        let deletedDataStoreIds: string[] = [];

        // Create couple of data stores.
        const dataStore2 = await factory.createInstance(mainDataStore._context.containerRuntime);
        const dataStore3 = await factory.createInstance(mainDataStore._context.containerRuntime);

        // Add the handles of the above dataStores to mark them as referenced.
        {
            mainDataStore._root.set("dataStore2", dataStore2.handle);
            mainDataStore._root.set("dataStore3", dataStore3.handle);

            // Wait for the summary that contains the above. Also, get this summary's version so that we can download
            // it from the server.
            const summaryResult = await waitForSummary();
            await validateUnreferencedFlag(
                summaryResult.sequenceNumber,
                deletedDataStoreIds,
                summaryResult.summaryVersion,
            );
        }

        // Remove the handles of the data stores to mark them as unreferenced.
        {
            mainDataStore._root.delete("dataStore2");
            mainDataStore._root.delete("dataStore3");
            deletedDataStoreIds.push(dataStore2.id);
            deletedDataStoreIds.push(dataStore3.id);

            // Wait for the summary that contains the above. Also, get this summary's version so that we can download
            // it from the server.
            const summaryResult = await waitForSummary();
            await validateUnreferencedFlag(
                summaryResult.sequenceNumber,
                deletedDataStoreIds,
                summaryResult.summaryVersion,
            );
        }

        // Add the handles of the data stores back to mark them as referenced again.
        {
            mainDataStore._root.set("dataStore2", dataStore2.handle);
            mainDataStore._root.set("dataStore3", dataStore3.handle);
            deletedDataStoreIds = [];

            // Wait for the summary that contains the above. Also, get this summary's version so that we can load
            // a new container with it.
            const summaryResult = await waitForSummary();
            await validateUnreferencedFlag(
                summaryResult.sequenceNumber,
                deletedDataStoreIds,
                summaryResult.summaryVersion,
            );
        }
    });
});
