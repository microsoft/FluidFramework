/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    ITestFluidObject,
    LocalCodeLoader,
    OpProcessingController,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";

describe("Document Dirty", () => {
    const documentId = "documentDirtyTest";
    const mapId = "mapKey";
    const codeDetails: IFluidCodeDetails = {
        package: "documentDirtyTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let documentServiceFactory: LocalDocumentServiceFactory;
    let opProcessingController: OpProcessingController;
    let container: Container;
    let dataObject: ITestFluidObject;
    let containerRuntime: IContainerRuntime;
    let sharedMap: SharedMap;
    let wasMarkedDirtyCount: number;
    let wasMarkedCleanCount: number;

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(c: Container): Promise<void> {
        assert.equal(c.connected, false);
        return new Promise((resolve) => c.once("connected", () => resolve()));
    }

    async function ensureContainerConnected(c: Container): Promise<void> {
        if (!c.connected) {
            return waitForContainerReconnection(c);
        }
    }

    /**
     * Increments clean count when the "savedDocument" event is fired
     */
    function registerSavedDocumentHandler(runtime: IContainerRuntime): void {
        runtime.on("savedDocument", () => {
            wasMarkedCleanCount += 1;
            assert.equal(runtime.isDocumentDirty(), false, "Document is marked clean");
            assert.equal(wasMarkedDirtyCount, wasMarkedCleanCount,
                "No superfluous transition event, dirty and clean count should match when state is clean");
        });
    }

    /**
     * Increments dirty count when the "dirtyDocument" event is fired
     */
    function registerDirtyDocumentHandler(runtime: IContainerRuntime): void {
        runtime.on("dirtyDocument", () => {
            wasMarkedDirtyCount += 1;
            assert.equal(runtime.isDocumentDirty(), true, "Document is marked dirty");
            assert.equal(wasMarkedDirtyCount - wasMarkedCleanCount, 1,
                "No superfluous transition event, dirty should be only one more then clean when state is dirty");
        });
    }

    async function createContainer(): Promise<IContainer> {
        const factory: TestFluidObjectFactory = new TestFluidObjectFactory(
            [
                [mapId, SharedMap.getFactory()],
            ],
            "default",
        );

        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                factory,
                [
                    [factory.type, Promise.resolve(factory)],
                ],
            );

        const urlResolver = new LocalResolver();
        const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

        const loader = new Loader({
            urlResolver,
            documentServiceFactory,
            codeLoader,
        });

        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);

        // Create the first container, component and DDSes.
        container = await createContainer() as Container;
        dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
        containerRuntime = dataObject.context.containerRuntime as IContainerRuntime;
        sharedMap = await dataObject.getSharedObject<SharedMap>(mapId);
        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(dataObject.runtime.deltaManager);

        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        sharedMap.set("setup", "done");

        await opProcessingController.process();

        wasMarkedDirtyCount = 0;
        wasMarkedCleanCount = 0;

        registerSavedDocumentHandler(containerRuntime);
        registerDirtyDocumentHandler(containerRuntime);
    });

    function checkDirtyState(
        when: string,
        expectedDirty: boolean,
        expectedCleanCount: number,
    ) {
        assert.equal(containerRuntime.isDocumentDirty(), expectedDirty,
            `Document dirty state not expected ${when}`);
        assert.equal(wasMarkedCleanCount, expectedCleanCount,
            `Document clean transition count not expected ${when}`);

        // no need to assert about wasMarkedDirtyCount, because we already assert that in the handler.
    }

    describe("Connected state", () => {
        it("marks state as dirty when ops are sent and clean when acks are received", async () => {
            sharedMap.set("key", "value");

            checkDirtyState("after value set", true, 0);

            // Wait for the ops to get processed which should mark the document clean after processing
            await opProcessingController.process();

            // Document will have been marked clean on reconnection

            checkDirtyState("after processing value set", false, 1);
        });

        it("marks state as dirty when batch ops are sent and clean when acks are received", async () => {
            dataObject.context.containerRuntime.orderSequentially(() => {
                sharedMap.set("key1", "value1");
                sharedMap.set("key2", "value2");
            });

            checkDirtyState("after batch value set", true, 0);

            // Wait for the ops to get processed which should mark the document clean after processing
            await opProcessingController.process();

            checkDirtyState("after processing batch value set", false, 1);
        });

        it(`doesn't affect document state while reconnecting`, async () => {
            // Disconnect the client.
            assert(container.clientId);
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            checkDirtyState("after disconnect", false, 0);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container);

            // Document will have been marked clean on reconnection
            checkDirtyState("after reconnect", false, 0);
        });
    });

    describe("Disconnected state", () => {
        it(`sets operations when disconnected and then reconnects to process them`, async () => {
            // Disconnect the client.
            assert(container.clientId);
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            // Set values in DDSes in disconnected state.
            sharedMap.set("key", "value");

            // Document should have been marked dirty again due to pending DDS ops
            checkDirtyState("after value set while disconnected", true, 0);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container);

            // Document should still be dirty right after reconnection
            checkDirtyState("after reconnect and replayed ops", true, 0);

            await opProcessingController.process();

            // Document will have been marked clean after process
            checkDirtyState("after processing replayed ops", false, 1);
        });

        it(`sets ops while connected, but disconnects before sending ops, then reconnects to process them`,
            async () => {
                // Set values in DDSes in disconnected state.
                sharedMap.set("key", "value");

                checkDirtyState("after value set", true, 0);

                // Disconnect the client.
                assert(container.clientId);
                documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

                // State not affect after disconnect
                checkDirtyState("after disconnect with value set", true, 0);

                // Wait for the Container to get reconnected.
                await waitForContainerReconnection(container);

                // Document should still be dirty right after reconnection
                checkDirtyState("after reconnect and replayed ops", true, 0);

                // Wait for the ops to get processed.
                await opProcessingController.process();

                // Document will have been marked clean after process
                checkDirtyState("after processing replayed ops", false, 1);
            });
    });

    describe("Disconnected state with batch operations", () => {
        it(`sets operations when disconnected and then reconnects to process them`, async () => {
            // Disconnect the client.
            assert(container.clientId);
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            // Set batch values in DDSes in disconnected state.
            dataObject.context.containerRuntime.orderSequentially(() => {
                sharedMap.set("key1", "value1");
                sharedMap.set("key2", "value2");
            });

            checkDirtyState("after batch value set", true, 0);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container);

            // Document should still be dirty right after reconnection
            checkDirtyState("after reconnect and replayed ops", true, 0);

            // Wait for the ops to get processed.
            await opProcessingController.process();

            // Document will have been marked clean after process
            checkDirtyState("after processing replayed ops", false, 1);
        });

        it(`sets ops while connected, but disconnects before sending ops, then reconnects to process them`,
            async () => {
                assert(container.clientId);

                // Set batch values in DDSes in connected state.
                dataObject.context.containerRuntime.orderSequentially(() => {
                    sharedMap.set("key1", "value1");
                    sharedMap.set("key2", "value2");
                });

                checkDirtyState("after batch value set", true, 0);

                // Disconnect the client.
                documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

                // State not affect after disconnect
                checkDirtyState("after disconnect with value set", true, 0);

                // Wait for the Container to get reconnected.
                await waitForContainerReconnection(container);

                // Document should still be dirty right after reconnection
                checkDirtyState("after reconnect and replayed ops", true, 0);

                // Wait for the ops to get processed.
                await opProcessingController.process();

                // Document will have been marked clean after process
                checkDirtyState("after processing replayed ops", false, 1);
            });
    });

    describe("Force readonly", () => {
        it(`sets operations when force readonly and then turn off force readonly to process them`, async () => {
            container.forceReadonly(true);
            await ensureContainerConnected(container);

            // Set values in DDSes in force read only state.
            sharedMap.set("key", "value");

            await opProcessingController.process();

            // Document should have been marked dirty again due to pending DDS ops
            checkDirtyState("after value set while force readonly", true, 0);

            container.forceReadonly(false);
            await ensureContainerConnected(container);

            // Document should still be dirty right after turning off force readonly
            checkDirtyState("after clear readonly and replayed ops", true, 0);

            await opProcessingController.process();

            // Document will have been marked clean after process
            checkDirtyState("after processing replayed ops", false, 1);
        });

        it(`sets ops then force readonly before sending ops, then turn off force readonly to process them`,
            async () => {
                // Set values in DDSes in write mode
                sharedMap.set("key", "value");

                checkDirtyState("after value set", true, 0);

                // force readonly
                container.forceReadonly(true);
                await ensureContainerConnected(container);

                await opProcessingController.process();

                // Document should have been marked dirty again due to pending DDS ops
                checkDirtyState("after value set while force readonly", true, 0);

                container.forceReadonly(false);
                await ensureContainerConnected(container);

                // Document should still be dirty right after turning off force readonly
                checkDirtyState("after reconnect and replayed ops", true, 0);

                await opProcessingController.process();

                // Document will have been marked clean after process
                checkDirtyState("after processing replayed ops", false, 1);
            });
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
