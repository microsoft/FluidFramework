/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ContainerRuntimeFactoryWithDefaultComponent } from "@fluidframework/aqueduct";
import { IComponentLoadable } from "@fluidframework/component-core-interfaces";
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
    let firstContainer: Container;
    let firstContainerClientId: string;
    let firstContainerComp: ITestFluidComponent & IComponentLoadable;
    let firstContainerCompContainerRuntime: IContainerRuntime;
    let firstContainerCompMap: SharedMap;
    let wasMarkedClean: boolean;

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(container: Container): Promise<void> {
        await new Promise((resolve) => container.once("connected", () => resolve()));
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
    Promise<ITestFluidComponent & IComponentLoadable> {
        const response = await fromContainer.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent & IComponentLoadable;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        documentServiceFactory = new TestDocumentServiceFactory(deltaConnectionServer);

        // Create the first container, component and DDSes.
        firstContainer = await createContainer();
        firstContainerComp = await getComponent("default", firstContainer);
        firstContainerCompContainerRuntime = firstContainerComp.context.containerRuntime as IContainerRuntime;
        firstContainerCompMap = await firstContainerComp.getSharedObject<SharedMap>(mapId);
        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(firstContainerComp.runtime);

        wasMarkedClean = false;
    });

    describe("Dirty state is updated correctly while in connected state", () => {
        it("marked dirty when ops are sent and clean when acks are received", async () => {
            // Set values in DDSes in disconnected state.
            firstContainerCompMap.set("key", "value");

            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), true,
                "Document is dirty after value set");

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });
    });

    describe("Dirty state is updated correctly while in disconnected state", () => {
        it(`mark false when disconnected, true when ops are sent, false again after
            the ops are processed after reconnecting`, async () => {
            firstContainerClientId = firstContainer.clientId;

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), false,
                "Document is marked clean on disconnect");

            // Set values in DDSes in disconnected state.
            firstContainerCompMap.set("key", "value");

            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), true,
                "Document is marked dirty on edit");

            // Wait for the Container to get reconnected.
            await Promise.all([
                waitForContainerReconnection(firstContainer),
                waitForMarkedClean(firstContainerCompContainerRuntime),
            ]);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedClean, true,
                "Document will have been marked clean on reconnection");

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), true,
                "Document should have been marked dirty after to overwrite the clean value,"
                + "so that the final state is dirty");

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });

        it(`marked dirty when ops are sent while connected and not set clean until 
            they are acked after reconnection`, async () => {
            firstContainerClientId = firstContainer.clientId;

            // Set values in DDSes in disconnected state.
            firstContainerCompMap.set("key", "value");

            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), true,
                "Document is marked dirty on edit");

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), true,
                "Document is still dirty on disconnect");

            // Wait for the Container to get reconnected.
            await Promise.all([
                waitForContainerReconnection(firstContainer),
                waitForMarkedClean(firstContainerCompContainerRuntime),
            ]);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedClean, true,
                "Document will have been marked clean on reconnection");

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), true,
                "Document should have been marked dirty after to overwrite the clean value, so that the final"
                + "state is dirty");

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            assert.equal(firstContainerCompContainerRuntime.isDocumentDirty(), false,
                "Document is cleaned after all ops have been acked");
        });
    });
});
