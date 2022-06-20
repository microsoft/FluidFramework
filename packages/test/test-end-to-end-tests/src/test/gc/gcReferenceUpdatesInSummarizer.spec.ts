/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
    IContainerRuntimeOptions,
    RuntimeHeaders,
    ISummarizer,
} from "@fluidframework/container-runtime";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { SharedMatrix } from "@fluidframework/matrix";
import { Marker, ReferenceType, reservedMarkerIdKey } from "@fluidframework/merge-tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { createSummarizerFromFactory, summarizeNow, waitForContainerConnection } from "./gcTestSummaryUtils";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }

    private readonly matrixKey = "matrix";
    public matrix!: SharedMatrix;
    public undoRedoStackManager!: UndoRedoStackManager;

    private readonly sharedStringKey = "sharedString";
    public sharedString!: SharedString;

    protected async initializingFirstTime() {
        const sharedMatrix = SharedMatrix.create(this.runtime);
        this.root.set(this.matrixKey, sharedMatrix.handle);

        const sharedString = SharedString.create(this.runtime);
        this.root.set(this.sharedStringKey, sharedString.handle);
    }

    protected async hasInitialized() {
        const matrixHandle = this.root.get<IFluidHandle<SharedMatrix>>(this.matrixKey);
        assert(matrixHandle !== undefined, "SharedMatrix not found");
        this.matrix = await matrixHandle.get();

        this.undoRedoStackManager = new UndoRedoStackManager();
        this.matrix.insertRows(0, 3);
        this.matrix.insertCols(0, 3);
        this.matrix.openUndo(this.undoRedoStackManager);

        const sharedStringHandle = this.root.get<IFluidHandle<SharedString>>(this.sharedStringKey);
        assert(sharedStringHandle !== undefined, "SharedMatrix not found");
        this.sharedString = await sharedStringHandle.get();
    }
}

/**
 * Validates this scenario: When all references to a data store are deleted, the data store is marked as unreferenced
 * in the next summary. When a reference to the data store is re-added, it is marked as referenced in the next summary.
 * Basically, if the handle to a data store is not stored in any DDS, its summary tree will have the "unreferenced"
 * property set to true. If the handle to a data store exists or it's a root data store, its summary tree does not have
 * the "unreferenced" property.
 *
 * The difference between these tests and the ones in the file 'gcReferenceUpdatesInLocalSummary' is that here we submit
 * summaries to the server, load new containers from the summary downloaded from server and validate them.
 */
describeNoCompat("GC reference updates in summarizer", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataStoreFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [SharedMatrix.getFactory(), SharedString.getFactory()],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            disableSummaries: true,
            summaryConfigOverrides: { state: "disabled" },
        },
        gcOptions: { gcAllowed: true },
    };
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataStoreFactory,
        [
            [dataStoreFactory.type, Promise.resolve(dataStoreFactory)],
        ],
        undefined,
        [innerRequestHandler],
        runtimeOptions,
    );

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;
    let summarizer: ISummarizer;

    /**
     * Waits for a summary with the current state of the document (including all in-flight changes). It basically
     * synchronizes all containers and waits for a summary that contains the last processed sequence number.
     * @returns the version of this summary. This version can be used to load a Container with the summary associated
     * with it.
     */
    async function waitForSummary(): Promise<string> {
        await provider.ensureSynchronized();
        const summaryResult = await summarizeNow(summarizer);
        return summaryResult.summaryVersion;
    }

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);
    const loadContainer = async (summaryVersion: string): Promise<IContainer> => {
        const requestHeader = {
            [LoaderHeader.version]: summaryVersion,
        };
        return provider.loadContainer(runtimeFactory, undefined /* options */, requestHeader);
    };

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await createContainer();
        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        mainDataStore._root.set("test", "value");
        await waitForContainerConnection(mainContainer);

        summarizer = await createSummarizerFromFactory(provider, mainContainer, dataStoreFactory);
    });

    describe("SharedMatrix", () => {
        it("should reflect handle updates immediately in the next summary", async () => {
            // Create a second data store (dataStore2).
            const dataStore2 = await dataStoreFactory.createInstance(mainDataStore._context.containerRuntime);

            // The request to use to load dataStore2.
            const request: IRequest = { url: dataStore2.id, headers: { [RuntimeHeaders.externalRequest]: true } };

            // Add the handle of dataStore2 to the matrix to mark it as referenced.
            {
                mainDataStore.matrix.setCell(0, 0, dataStore2.handle);

                // Wait for the summary that contains the above. Also, get this summary's version so that we can load
                // a new container with it.
                const summaryVersion = await waitForSummary();

                // Since dataStore should be marked as referenced in the summary that container2 loaded with, requesting
                // it with externalRequest header should succeed.
                const container2 = await loadContainer(summaryVersion);
                const response = await container2.request(request);
                assert(response.status === 200, "dataStore2 should have successfully loaded");
            }

            // Remove the handle of dataStore2 from the matrix to mark it as unreferenced.
            {
                mainDataStore.matrix.removeCols(0, 1);

                // Wait for the summary that contains the above. Also, get this summary's version so that we can load
                // a new container with it.
                const summaryVersion = await waitForSummary();

                // Since dataStore should be marked as unreferenced in the summary that container2 loaded with,
                // requesting it with externalRequest header should fail.
                const container2 = await loadContainer(summaryVersion);
                const response = await container2.request(request);
                assert(response.status === 404, "dataStore2 should have failed to load");
            }
        });

        it("should reflect undo / redo of handle updates immediately in the next summary", async () => {
            // Create a second data store (dataStore2).
            const dataStore2 = await dataStoreFactory.createInstance(mainDataStore._context.containerRuntime);

            // The request to use to load dataStore2.
            const request: IRequest = { url: dataStore2.id, headers: { [RuntimeHeaders.externalRequest]: true } };

            // Add and then remove the handle of dataStore2 to the matrix to mark it as unreferenced.
            {
                mainDataStore.matrix.setCell(0, 0, dataStore2.handle);
                mainDataStore.undoRedoStackManager.closeCurrentOperation();

                // Wait for summary that contains the above.
                await waitForSummary();

                // Now delete the handle so that dataStore2 is marked as unreferenced.
                mainDataStore.matrix.removeCols(0, 1);
                mainDataStore.undoRedoStackManager.closeCurrentOperation();

                // Wait for the summary that contains the above. Also, get this summary's version so that we can load
                // a new container with it.
                const summaryVersion = await waitForSummary();

                // Since dataStore should be marked as unreferenced in the summary that container2 loaded with,
                // requesting it with externalRequest header should fail.
                const container2 = await loadContainer(summaryVersion);
                const response = await container2.request(request);
                assert(response.status === 404, "dataStore2 should have failed to load");
            }

            // Undo the operation that removed the column so that dataStore2 is marked as referenced again.
            {
                mainDataStore.undoRedoStackManager.undoOperation();

                // Wait for the summary that contains the above. Also, get this summary's version so that we can load
                // a new container with it.
                const summaryVersion = await waitForSummary();

                // Since dataStore should be marked as referenced in the summary that container2 loaded with, requesting
                // it with externalRequest header should succeed.
                const container2 = await loadContainer(summaryVersion);
                const response = await container2.request(request);
                assert(response.status === 200, "dataStore2 should successfully load now");
            }

            // Redo the operation that removed the column so that dataStore2 is marked as unreferenced again.
            {
                mainDataStore.undoRedoStackManager.redoOperation();

                // Wait for the summary that contains the above. Also, get this summary's version so that we can load
                // a new container with it.
                const summaryVersion = await waitForSummary();

                // Since dataStore should be marked as unreferenced in the summary that container2 loaded with,
                // requesting it with externalRequest header should fail.
                const container2 = await loadContainer(summaryVersion);
                const response = await container2.request(request);
                assert(response.status === 404, "dataStore2 should successfully load now");
            }
        });
    });

    describe("SharedString", () => {
        it("should reflect handle updates immediately in the next summary", async () => {
            // Create a second data store (dataStore2).
            const dataStore2 = await dataStoreFactory.createInstance(mainDataStore._context.containerRuntime);

            // The request to use to load dataStore2.
            const request: IRequest = { url: dataStore2.id, headers: { [RuntimeHeaders.externalRequest]: true } };

            // Add the handle of dataStore2 to the shared string to mark it as referenced.
            {
                mainDataStore.sharedString.insertText(0, "World");
                mainDataStore.sharedString.insertMarker(
                    0,
                    ReferenceType.Simple,
                    {
                        [reservedMarkerIdKey]: "markerId",
                        ["handle"]: dataStore2.handle,
                    },
                );

                // Wait for the summary that contains the above. Also, get this summary's version so that we can load
                // a new container with it.
                const summaryVersion = await waitForSummary();

                // Since dataStore should be marked as referenced in the summary that container2 loaded with, requesting
                // it with externalRequest header should succeed.
                const container2 = await loadContainer(summaryVersion);
                const response = await container2.request(request);
                assert(response.status === 200, "dataStore2 should have successfully loaded");
            }

            // Remove the handle of dataStore2 from the shared string to mark it as unreferenced.
            {
                const marker = mainDataStore.sharedString.getMarkerFromId("markerId") as Marker;
                mainDataStore.sharedString.annotateMarker(
                    marker,
                    {
                        ["handle"]: "",
                    },
                );

                // Wait for the summary that contains the above. Also, get this summary's version so that we can load
                // a new container with it.
                const summaryVersion = await waitForSummary();

                // Since dataStore should be marked as unreferenced in the summary that container2 loaded with,
                // requesting it with externalRequest header should fail.
                const container2 = await loadContainer(summaryVersion);
                const response = await container2.request(request);
                assert(response.status === 404, "dataStore2 should have failed to load");
            }

            // Add back the handle of dataStore2 to the shared string to mark it as referenced.
            {
                const marker = mainDataStore.sharedString.getMarkerFromId("markerId") as Marker;
                mainDataStore.sharedString.annotateMarker(
                    marker,
                    {
                        ["handle"]: dataStore2.handle,
                    },
                );

                // Wait for the summary that contains the above. Also, get this summary's version so that we can load
                // a new container with it.
                const summaryVersion = await waitForSummary();

                // Since dataStore should be marked as referenced in the summary that container2 loaded with,
                // requesting it with externalRequest header should succeed.
                const container2 = await loadContainer(summaryVersion);
                const response = await container2.request(request);
                assert(response.status === 200, "dataStore2 should have successfully loaded");
            }
        });
    });
});
