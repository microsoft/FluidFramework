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
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IAckedSummary, IContainerRuntimeOptions, SummaryCollection } from "@fluidframework/container-runtime";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { SharedMatrix } from "@fluidframework/matrix";
import { Marker, ReferenceType, reservedMarkerIdKey } from "@fluidframework/merge-tree";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";
import { flattenRuntimeOptions } from "../flattenRuntimeOptions";

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
        const matrixHandle = await this.root.wait<IFluidHandle<SharedMatrix>>(this.matrixKey);
        assert(matrixHandle !== undefined, "SharedMatrix not found");
        this.matrix = await matrixHandle.get();

        this.undoRedoStackManager = new UndoRedoStackManager();
        this.matrix.insertRows(0, 3);
        this.matrix.insertCols(0, 3);
        this.matrix.openUndo(this.undoRedoStackManager);

        const sharedStringHandle = await this.root.wait<IFluidHandle<SharedString>>(this.sharedStringKey);
        assert(sharedStringHandle !== undefined, "SharedMatrix not found");
        this.sharedString = await sharedStringHandle.get();
    }
}

// REVIEW: enable compat testing?
describeNoCompat("GC reference updates in summarizer", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const factory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [ SharedMatrix.getFactory(), SharedString.getFactory() ],
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
        flattenRuntimeOptions(runtimeOptions),
    );

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;
    let summaryCollection: SummaryCollection;

    /**
     * Waits for a summary with the current state of the document (including all in-flight changes). It basically
     * synchronizes all containers and waits for a summary that contains the last processed sequence number.
     * @returns the version of this summary. This version can be used to load a Container with the summary associated
     * with it.
     */
     async function waitForSummary(): Promise<string> {
        await provider.ensureSynchronized();
        const ackedSummary: IAckedSummary =
            await summaryCollection.waitSummaryAck(mainContainer.deltaManager.lastSequenceNumber);
        return ackedSummary.summaryAck.contents.handle;
    }

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);
    const loadContainer = async (summaryVersion: string): Promise<IContainer> => {
        const requestHeader = {
            [LoaderHeader.version]: summaryVersion,
        };
        return provider.loadContainer(runtimeFactory, undefined /* options */, requestHeader);
    };

    beforeEach(async () => {
        provider = getTestObjectProvider();

        // Create a Container for the first client.
        mainContainer = await createContainer();

        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        mainDataStore._root.set("test", "value");

        await provider.ensureSynchronized();

        // Create and setup a summary collection that will be used to track and wait for summaries.
        summaryCollection = new SummaryCollection(mainContainer.deltaManager, new TelemetryNullLogger());
    });

    describe("SharedMatrix", () => {
        it("should reflect handle updates immediately in the next summary", async () => {
            // Create a second data store (dataStore2).
            const dataStore2 = await factory.createInstance(mainDataStore._context.containerRuntime);

            // The request to use to load dataStore2.
            const request: IRequest = { url: dataStore2.id, headers: { externalRequest: true } };

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
            const dataStore2 = await factory.createInstance(mainDataStore._context.containerRuntime);

            // The request to use to load dataStore2.
            const request: IRequest = { url: dataStore2.id, headers: { externalRequest: true } };

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
            const dataStore2 = await factory.createInstance(mainDataStore._context.containerRuntime);

            // The request to use to load dataStore2.
            const request: IRequest = { url: dataStore2.id, headers: { externalRequest: true } };

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
