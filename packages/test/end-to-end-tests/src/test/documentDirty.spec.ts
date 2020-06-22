/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ContainerRuntimeFactoryWithDefaultComponent } from "@fluidframework/aqueduct";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager, TestDocumentServiceFactory, TestResolver } from "@fluidframework/local-driver";
import { SharedMap } from "@fluidframework/map";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
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
        await new Promise((resolve) => c.once("connected", () => resolve()));
    }

    /**
     * Increments clean count when the "savedDocument" event is fired
     */
    function onMarkedClean(runtime: IContainerRuntime): void {
        runtime.on("savedDocument", () => {
            wasMarkedCleanCount += 1;
            assert.equal(runtime.isDocumentDirty(), false, "Document is marked clean");
        });
    }

    /**
     * Increments dirty count when the "dirtyDocument" event is fired
     */
    function onMarkedDirty(runtime: IContainerRuntime): void {
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

        onMarkedClean(containerCompContainerRuntime);
        onMarkedDirty(containerCompContainerRuntime);
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

        it(`doesn't marks document as clean when disconnected`, async () => {
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
        it(`set when disconnected and reconnected`, async () => {
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
                "Document should have been marked dirty after to overwrite the clean value,"
                + "so that the final state is dirty");

            await containerDeltaEventManager.process();

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirtyCount, 4,
                `Document will have incremented the dirty count twice, once for itself and once for the DDS`);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedCleanCount, 4,
                "Document will have been marked clean three times, twice for the DDS, once for itself");
        });

        it(`sets on connected, but disconnects before sending ops, then reconnects`, async () => {
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
                "Document should have been marked dirty after to overwrite the clean value, so that the final"
                + "state is dirty");

            // Wait for the ops to get processed.
            await containerDeltaEventManager.process();

            assert.equal(wasMarkedDirtyCount, 3,
                `Document will have incremented the dirty count twice, once for itself and once for the DDS`);

            // Document will have been marked clean again on reconnection
            assert.equal(wasMarkedCleanCount, 3,
                `Document will have been marked clean twice on reconnection, for itself and its DDS.
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
