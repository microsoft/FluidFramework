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
    let wasMarkedDirty: boolean;
    let wasMarkedClean: boolean;

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(c: Container): Promise<void> {
        await new Promise((resolve) => c.once("connected", () => resolve()));
    }

    /**
     * Waits for the "savedDocument" event on the runtime
     */
    async function waitForMarkedClean(runtime: IContainerRuntime): Promise<void> {
        await new Promise((resolve) => runtime.once("savedDocument", () => {
            wasMarkedClean = true;
            resolve();
        }));
    }

    /**
     * Waits for the "dirtyDocument" event on the runtime
     */
    async function waitForMarkedDirty(runtime: IContainerRuntime): Promise<void> {
        await new Promise((resolve) => runtime.once("dirtyDocument", () => {
            wasMarkedDirty = true;
            resolve();
        }));
    }

    async function createContainer(): Promise<Container> {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory(
            [
                [ mapId, SharedMap.getFactory() ],
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
        const codeLoader = new LocalCodeLoader([[ codeDetails, runtimeFactory ]]);

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

        wasMarkedDirty = false;
        wasMarkedClean = false;
    });

    describe("Dirty state is updated correctly while in connected state", () => {
        it("marks state as dirty when ops are sent and clean when acks are received", async () => {
            await containerDeltaEventManager.pauseProcessing();
            containerCompMap.set("key", "value");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is dirty after value set");

            // Wait for the ops to get processed which should mark the document clean after processing
            await Promise.all([
                containerDeltaEventManager.resumeProcessing(),
                containerDeltaEventManager.process(),
                waitForMarkedClean(containerCompContainerRuntime),
            ]);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedClean, true,
                "Document will have been marked clean after ops are processed");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });
    });

    describe("Dirty state is updated correctly while in disconnected state", () => {
        it(`marks document as clean when disconnected, dirty when ops are sent, and clean again after
            the ops are processed after reconnecting`, async () => {
            // Disconnect the client.
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            // Set values in DDSes in disconnected state.
            containerCompMap.set("key", "value");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is marked dirty on edit");

            // Wait for the Container to get reconnected.
            await Promise.all([
                waitForContainerReconnection(container),
                waitForMarkedDirty(containerCompContainerRuntime),
                waitForMarkedClean(containerCompContainerRuntime),
            ]);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedClean, true,
                "Document will have been marked clean on reconnection");

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirty, true,
                "Document should have been marked dirty again due to pending DDS ops");

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document should have been marked dirty after to overwrite the clean value,"
                + "so that the final state is dirty");

            // Wait for the ops to get processed.
            await containerDeltaEventManager.process();

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });

        it(`marks document dirty when ops are sent while connected and doesn't set ot clean until 
            they are acked after reconnection`, async () => {
            // Set values in DDSes in disconnected state.
            containerCompMap.set("key", "value");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is marked dirty on edit");

            // Disconnect the client.
            documentServiceFactory.disconnectClient(container.clientId, "Disconnected for testing");

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document is still dirty on disconnect");

            // Wait for the Container to get reconnected.
            await Promise.all([
                waitForContainerReconnection(container),
                waitForMarkedDirty(containerCompContainerRuntime),
                waitForMarkedClean(containerCompContainerRuntime),
                containerDeltaEventManager.resumeProcessing(),
            ]);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedClean, true,
                "Document will have been marked clean on reconnection");

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirty, true,
                "Document should have been marked dirty again due to pending DDS ops");

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(containerCompContainerRuntime.isDocumentDirty(), true,
                "Document should have been marked dirty after to overwrite the clean value, so that the final"
                + "state is dirty");

            // Wait for the ops to get processed.
            await containerDeltaEventManager.process();

            assert.equal(containerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });
    });
});
