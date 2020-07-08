/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ContainerRuntimeFactoryWithDefaultComponent } from "@fluidframework/aqueduct";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { TestDocumentServiceFactory, TestResolver } from "@fluidframework/local-driver";
import { SharedMap } from "@fluidframework/map";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    DocumentDeltaEventManager,
    LocalCodeLoader,
    initializeLocalContainer,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

describe("Document Dirty", () => {
    const id = `fluid-test://localhost/documentDirtyTest`;
    const mapId = "mapKey";
    const codeDetails: IFluidCodeDetails = {
        package: "documentDirtyTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let documentServiceFactory: TestDocumentServiceFactory;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let container: Container;
    let containerComp: ITestFluidComponent;
    let containerCompContainerRuntime: IContainerRuntime;
    let containerCompMap: SharedMap;
    let wasMarkedDirtyCount: number;
    let wasMarkedCleanCount: number;

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(c: Container): Promise<void> {
        assert.equal(c.connected, false);
        await new Promise((resolve) => c.once("connected", () => resolve()));
    }

    /**
     * Increments clean count when the "savedDocument" event is fired
     */
    function registerSavedDocumentHandler(runtime: IContainerRuntime): void {
        runtime.on("savedDocument", () => {
            wasMarkedCleanCount += 1;
            assert.equal(runtime.isDocumentDirty(), false, "Document is marked clean");
        });
    }

    /**
     * Increments dirty count when the "dirtyDocument" event is fired
     */
    function registerDirtyDocumentHandler(runtime: IContainerRuntime): void {
        runtime.on("dirtyDocument", () => {
            wasMarkedDirtyCount += 1;
            assert.equal(runtime.isDocumentDirty(), true, "Document is marked dirty");
        });
    }

    async function createContainer(): Promise<Container> {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory(
            [
                [mapId, SharedMap.getFactory()],
            ],
        );

        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultComponent(
                "default",
                [
                    ["default", Promise.resolve(factory)],
                ],
            );

        const urlResolver = new TestResolver();
        const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

        const loader = new Loader(
            urlResolver,
            documentServiceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>());

        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent(componentId: string, fromContainer: Container):
        Promise<ITestFluidComponent> {
        const response = await fromContainer.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        documentServiceFactory = new TestDocumentServiceFactory(deltaConnectionServer);

        // Create the first container, component and DDSes.
        container = await createContainer();
        containerComp = await getComponent("default", container);
        containerCompContainerRuntime = containerComp.context.containerRuntime as IContainerRuntime;
        containerCompMap = await containerComp.getSharedObject<SharedMap>(mapId);
        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(containerComp.runtime);

        await containerDeltaEventManager.process();

        wasMarkedDirtyCount = 0;
        wasMarkedCleanCount = 0;

        registerSavedDocumentHandler(containerCompContainerRuntime);
        registerDirtyDocumentHandler(containerCompContainerRuntime);
    });

    describe("Connected state", () => {
        it("marks state as dirty when ops are sent and clean when acks are received", async () => {
            containerCompMap.set("key", "value");

            assert.equal(wasMarkedDirtyCount, 1,
                "Document will have been marked dirty after value set");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is dirty after value set");

            // Wait for the ops to get processed which should mark the document clean after processing
            await containerDeltaEventManager.process();

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 1,
                "Document will have been marked clean after ops are processed");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });

        // TODO: Enable this test once #2653 is fixed
        it.skip("marks state as dirty when batch ops are sent and clean when acks are received", async () => {
            containerComp.context.containerRuntime.orderSequentially(() => {
                containerCompMap.set("key1", "value1");
                containerCompMap.set("key2", "value2");
            });

            assert.equal(wasMarkedDirtyCount, 1,
                "Document will have been marked dirty after value set");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is dirty after value set");

            // Wait for the ops to get processed which should mark the document clean after processing
            await containerDeltaEventManager.process();

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });

        it(`doesn't affect document state while reconnecting`, async () => {
            // Disconnect the client.
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 0,
                "Document will not have been marked clean again on reconnection if it was already clean");
        });
    });

    describe("Disconnected state", () => {
        it(`sets operations when disconnected and then reconnects to process them`, async () => {
            // Disconnect the client.
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            // Set values in DDSes in disconnected state.
            containerCompMap.set("key", "value");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is marked dirty on edit");

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirtyCount, 1,
                `Document should have been marked dirty due to value set`);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 1,
                "Document will have been marked clean on reconnection");

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirtyCount, 2,
                `Document should have been marked dirty again due to pending DDS ops and incremented the count.
                Dirty count: ${wasMarkedDirtyCount}`);

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document should have been marked dirty to overwrite the clean value,"
                + "so that the final state is dirty");

            await containerDeltaEventManager.process();

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");

            // TODO: These counts should be 2 once #2724 is closed
            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirtyCount, 3,
                `Document will have incremented the dirty count`);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 3,
                "Document will have been marked clean two more times");
        });

        it(`sets ops while connected, but disconnects before sending ops,
        then reconnects to process them`, async () => {
            // Set values in DDSes in disconnected state.
            containerCompMap.set("key", "value");

            assert.equal(wasMarkedDirtyCount, 1,
                `Document will have incremented the dirty count due to the value set`);

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is marked dirty on edit");

            // Disconnect the client.
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            assert.equal(wasMarkedDirtyCount, 1,
                `Document will not increment the dirty count as it was already dirty`);

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is still dirty on disconnect");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 1,
                "Document will have been marked clean on reconnection");

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document should have been marked dirty to overwrite the clean value, so that the final"
                + "state is dirty");

            // Wait for the ops to get processed.
            await containerDeltaEventManager.process();

            assert.equal(wasMarkedDirtyCount, 2,
                `Document will have incremented the dirty count`);

            // Document will have been marked clean again on reconnection
            assert.equal(wasMarkedCleanCount, 2,
                `Document will have been incremented the clean count on reconnection.
                Clean count: ${wasMarkedCleanCount}`);

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });
    });

    describe("Disconnected state with batch operations", () => {
        it(`sets operations when disconnected and then reconnects to process them`, async () => {
            // Disconnect the client.
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            // Set batch values in DDSes in disconnected state.
            containerComp.context.containerRuntime.orderSequentially(() => {
                containerCompMap.set("key1", "value1");
                containerCompMap.set("key2", "value2");
            });

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is marked dirty on edit");

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirtyCount, 1,
                `Document should have been marked dirty due to value set`);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 1,
                "Document will have been marked clean on reconnection");

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirtyCount, 2,
                `Document should have been marked dirty again due to pending DDS ops and incremented the count.
                Dirty count: ${wasMarkedDirtyCount}`);

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document should have been marked dirty after to overwrite the clean value,"
                + "so that the final state is dirty");

            await containerDeltaEventManager.process();

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");

            // TODO: These counts should be 2 once #2724 is closed
            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirtyCount, 3,
                `Document will have incremented the dirty count`);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 3,
                "Document will have been marked clean twice more");
        });

        it(`sets ops while connected, but disconnects before sending ops,
        then reconnects to process them`, async () => {
            // Set batch values in DDSes in disconnected state.
            containerComp.context.containerRuntime.orderSequentially(() => {
                containerCompMap.set("key1", "value1");
                containerCompMap.set("key2", "value2");
            });

            assert.equal(wasMarkedDirtyCount, 1,
                `Document will have incremented the dirty count due to the value set`);

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is marked dirty on edit");

            // Disconnect the client.
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            assert.equal(wasMarkedDirtyCount, 1,
                `Document will not increment the dirty count as it was already dirty`);

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is still dirty on disconnect");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 1,
                "Document will have been marked clean on reconnection");

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document should have been marked dirty after to overwrite the clean value, so that the final"
                + "state is dirty");

            // Wait for the ops to get processed.
            await containerDeltaEventManager.process();

            assert.equal(wasMarkedDirtyCount, 2,
                `Document will have incremented the dirty count`);

            // Document will have been marked clean again on reconnection
            assert.equal(wasMarkedCleanCount, 2,
                `Document will have been marked clean again.
                Clean count: ${wasMarkedCleanCount}`);

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
        containerCompContainerRuntime.removeAllListeners();
    });
});
