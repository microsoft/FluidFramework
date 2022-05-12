/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { stringToBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { Container } from "@fluidframework/container-loader";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { channelsTreeName, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { getGCStateFromSummary, TestDataObject } from "../mockSummarizerClient";
import { mockConfigProvider } from "./mockConfigProivder";

/**
 * Validates that when running in GC test mode, unreferenced content is deleted from the summary.
 */
describeFullCompat("GC delete objects in test mode", (getTestObjectProvider) => {
    // If deleteUnreferencedContent is true, GC is run in test mode where content that is not referenced is
    // deleted after each GC run.
    const tests = (deleteUnreferencedContent: boolean = false) => {
        const dataObjectFactory = new DataObjectFactory(
            "TestDataObject",
            TestDataObject,
            [],
            []);
        const runtimeOptions: IContainerRuntimeOptions = {
            summaryOptions: { disableSummaries: true },
            gcOptions: { gcAllowed: true, runGCInTestMode: deleteUnreferencedContent, writeDataAtRoot: true },
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
        // Enable config provider setting to write GC data at the root.
        const settings = { "Fluid.GarbageCollection.WriteDataAtRoot": "true" };
        const configProvider = mockConfigProvider(settings);

        let provider: ITestObjectProvider;
        let containerRuntime: ContainerRuntime;
        let defaultDataStore: TestDataObject;

        const createContainer = async () => provider.createContainer(runtimeFactory, { configProvider });

        /**
         * Validates that the summary trees of children have the given reference state.
         */
        function validateChildReferenceStates(summary: ISummaryTree, referenced: boolean) {
            const expectedUnreferenced = referenced ? undefined : true;
            for (const [id, summaryObject] of Object.entries(summary.tree)) {
                if (summaryObject.type !== SummaryType.Tree) {
                    continue;
                }
                assert(
                    summaryObject.unreferenced === expectedUnreferenced,
                    `Summary tree ${id} should be ${ referenced ? "referenced" : "unreferenced" }`,
                );
                validateChildReferenceStates(summaryObject, referenced);
            }
        }

        /**
         * Validates that the request to load the data store with the given id succeeds / fail as expected.
         * For referenced data stores, we should always be able to load them.
         * For unreferenced data store:
         *   - If deleteUnreferencedContent is true, the load should fail with 404 because the data store is deleted.
         *   - Otherwise, the load should pass because the data store exists.
         */
        async function validateDataStoreLoad(dataStoreId: string, referenced: boolean) {
            const response = await containerRuntime.resolveHandle({
                url: `/${dataStoreId}`, headers: { wait: false },
            });
            // If deleteUnreferencedContent is true, unreferenced data stores are deleted after GC runs. So, we should
            // get a 404 response. Otherwise, we should get a 200.
            const expectedStatus = deleteUnreferencedContent && !referenced ? 404 : 200;
            assert(
                response.status === expectedStatus,
                `Data store ${dataStoreId} ${ referenced ? "should" : "should not" } have loaded`,
            );
        }

        /**
         * Validates the state of the given node in the GC summary tree:
         * - If referenced = true, it should exist in the summary and should not have unreferenced timestamp.
         * - If referenced = false and deletedFromGCState = false, it should exist in the summary and should have
         *   unreferenced timestamp.
         * - If referenced = false and deletedFromGCState = true, it should not exist in the summary.
         */
        async function validateNodeStateInGCSummaryTree(
            nodeId: string,
            referenced: boolean,
            deletedFromGCState = false,
        ) {
            await provider.ensureSynchronized();
            const { summary } = await containerRuntime.summarize({
                runGC: true,
                fullTree: true,
                trackState: false,
                summaryLogger: new TelemetryNullLogger(),
            });

            const gcState = getGCStateFromSummary(summary);
            assert(gcState !== undefined, "GC tree is not available in the summary");

            let nodeFound = false;
            for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
                // Blob node path format - "/_blobs/<blobId>"
                // Data store node path format - "/<dataStoreId>/..."
                const pathParts = nodePath.split("/");
                const actualNodeId = pathParts[1] === "_blobs" ? pathParts[2] : pathParts[1];
                if (actualNodeId === nodeId) {
                    if (referenced) {
                        assert(
                            nodeData.unreferencedTimestampMs === undefined,
                            `Node ${nodeId} is referenced and should not have unreferenced timestamp`,
                        );
                    } else {
                        assert(
                            nodeData.unreferencedTimestampMs !== undefined,
                            `Node ${nodeId} is unreferenced and should have unreferenced timestamp`,
                        );
                    }
                    nodeFound = true;
                    break;
                }
            }

            // If deletedFromGCState is true, the GC summary should not have the given node's entry. Else, it should.
            if (deletedFromGCState) {
                assert(!nodeFound, `Entry for ${nodeId} should not exist in the GC summary tree as its deleted.`);
            } else {
                assert(nodeFound, `Entry for ${nodeId} not found in the GC summary tree.`);
            }
            return summary;
        }

        /**
         * Validates the data store referenced state in the GC summary tree and in the data store's summary tree.
         */
        async function validateDataStoreReferenceState(
            dataStoreId: string,
            referenced: boolean,
            deletedFromGCState = false,
        ) {
            const summary = await validateNodeStateInGCSummaryTree(dataStoreId, referenced, deletedFromGCState);
            await validateDataStoreLoad(dataStoreId, referenced);

            let dataStoreTree: ISummaryTree | undefined;
            const channelsTree = (summary.tree[channelsTreeName] as ISummaryTree).tree;
            for (const [id, summaryObject] of Object.entries(channelsTree)) {
                if (id === dataStoreId) {
                    assert(
                        summaryObject.type === SummaryType.Tree,
                        `Data store ${dataStoreId}'s entry is not a tree`,
                    );
                    dataStoreTree = summaryObject;
                    break;
                }
            }

            // If deleteUnreferencedContent is true, unreferenced data stores are deleted in each summary. So,
            // the summary should not contain the data store entry.
            if (deleteUnreferencedContent && !referenced) {
                assert(dataStoreTree === undefined, `Data store ${dataStoreId} should not be in the summary!`);
            } else {
                // For referenced data store, the unreferenced flag in its summary tree is undefined.
                const expectedUnreferenced = referenced ? undefined : true;
                assert(dataStoreTree !== undefined, `Data store ${dataStoreId} is not in the summary!`);
                assert(
                    dataStoreTree.unreferenced === expectedUnreferenced,
                    `Data store ${dataStoreId} should be ${ referenced ? "referenced" : "unreferenced" }`,
                );

                // Validate that the summary trees of its children are marked as referenced. Currently, GC only runs
                // at data store layer so everything below that layer is marked as referenced.
                validateChildReferenceStates(dataStoreTree, true /* referenced */);
            }
        }

        /**
         * Validates the reference state of the attachment blob with the given handle in the GC summary tree and in
         * the blob summary tree.
         */
        async function validateBlobsReferenceState(
            blobHandle: IFluidHandle<ArrayBufferLike>,
            referenced: boolean,
            deletedFromGCState = false,
        ) {
            const blobId = blobHandle.absolutePath.split("/")[2];
            const summary = await validateNodeStateInGCSummaryTree(blobId, referenced, deletedFromGCState);

            const blobsTree = (summary.tree[".blobs"] as ISummaryTree).tree;
            let blobFound = false;
            for (const [, attachment] of Object.entries(blobsTree)) {
                assert(attachment.type === SummaryType.Attachment, "blob tree should only contain attachment blobs");
                if (attachment.id === blobId) {
                    blobFound = true;
                }
            }

            // If deleteUnreferencedContent is true, unreferenced blob ids are deleted in each summary. So,
            // the summary should not contain the blob id.
            if (referenced || !deleteUnreferencedContent) {
                assert(blobFound, `Blob with id ${blobId} should be in blob summary tree`);
            } else {
                assert(!blobFound, `Blob with id ${blobId} should not be in blob summary tree`);
            }
        }

        beforeEach(async function() {
            provider = getTestObjectProvider();
            if (provider.driver.type !== "local") {
                this.skip();
            }
            const container = await createContainer() as Container;
            defaultDataStore = await requestFluidObject<TestDataObject>(container, "/");
            containerRuntime = defaultDataStore.containerRuntime;
        });

        it("marks default data store as referenced", async () => {
            await validateDataStoreReferenceState(defaultDataStore.id, true /* referenced */);
        });

        it("marks root data stores as referenced", async () => {
            const rootDataStore = await dataObjectFactory.createRootInstance("rootDataStore", containerRuntime);
            await validateDataStoreReferenceState(rootDataStore.id, true /* referenced */);
        });

        it("marks non-root data stores as referenced / unreferenced correctly", async () => {
            const dataStore = await dataObjectFactory.createInstance(containerRuntime);
            // Add data store's handle in root component and verify its marked as referenced.
            defaultDataStore._root.set("nonRootDS", dataStore.handle);
            await validateDataStoreReferenceState(dataStore.id, true /* referenced */);

            // Remove its handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("nonRootDS");
            await validateDataStoreReferenceState(dataStore.id, false /* referenced */);

            // Add data store's handle back in root component. If deleteUnreferencedContent is true, the data store
            // should get deleted and should remain unreferenced. Otherwise, it should be referenced back.
            // Also, if deleteUnreferencedContent is true, it won't be in the GC state in the summary anymore.
            defaultDataStore._root.set("nonRootDS", dataStore.handle);
            await validateDataStoreReferenceState(
                dataStore.id,
                deleteUnreferencedContent ? false : true /* referenced */,
                deleteUnreferencedContent ? true : false /* deletedFromGCState */,
            );
        });

        it("marks attachment blobs as referenced / unreferenced correctly", async () => {
            // Upload couple of attachment blobs and mark them referenced.
            const blob1Contents = "Blob contents 1";
            const blob2Contents = "Blob contents 2";
            const blob1Handle = await defaultDataStore._context.uploadBlob(stringToBuffer(blob1Contents, "utf-8"));
            const blob2Handle = await defaultDataStore._context.uploadBlob(stringToBuffer(blob2Contents, "utf-8"));
            defaultDataStore._root.set("blob1", blob1Handle);
            defaultDataStore._root.set("blob2", blob2Handle);
            await validateBlobsReferenceState(blob1Handle, true /* referenced */);
            await validateBlobsReferenceState(blob2Handle, true /* referenced */);

            // Remove blob1's handle and verify its marked as unreferenced.
            defaultDataStore._root.delete("blob1");
            await validateBlobsReferenceState(blob1Handle, false /* referenced */);

            // Add blob1's handle back. If deleteUnreferencedContent is true, the blob should get deleted and should
            // remain unreferenced. Otherwise, it should be referenced back.
            // Also, if deleteUnreferencedContent is true, it won't be in the GC state in the summary anymore.
            defaultDataStore._root.set("blob1", blob1Handle);
            await validateBlobsReferenceState(
                blob1Handle,
                deleteUnreferencedContent ? false : true /* referenced */,
                deleteUnreferencedContent ? true : false /* deletedFromGCState */,
            );
        });

        it("marks non-root data stores with handle in unreferenced data stores as unreferenced", async () => {
            // Create a non-root data store - dataStore1.
            const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
            // Add dataStore1's handle in root component and verify its marked as referenced.
            defaultDataStore._root.set("nonRootDS1", dataStore1.handle);
            await validateDataStoreReferenceState(dataStore1.id, true /* referenced */);

            // Create another non-root data store - dataStore2.
            const dataStore2 = await dataObjectFactory.createInstance(containerRuntime);
            // Add dataStore2's handle in dataStore1 and verify its marked as referenced.
            dataStore1._root.set("nonRootDS2", dataStore2.handle);
            await validateDataStoreReferenceState(dataStore2.id, true /* referenced */);

            // Remove dataStore1's handle. This should mark dataStore1 as unreferenced which in turn should mark
            // dataStore2 as unreferenced.
            defaultDataStore._root.delete("nonRootDS1");
            await validateDataStoreReferenceState(dataStore2.id, false /* referenced */);
        });
    };

    describe("Verify data store state when unreferenced content is marked", () => {
        tests();
    });

    describe("Verify data store state when unreferenced content is deleted", () => {
        tests(true /* deleteUnreferencedContent */);
    });
});
