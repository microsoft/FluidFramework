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
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { SharedString } from "@fluidframework/sequence";
import {
    LocalCodeLoader,
    initializeLocalContainer,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

describe("Document Dirty", () => {
    const id = `fluid-test://localhost/documentDirtyTest`;
    const map1Id = "map1Key";
    const map2Id = "map2Key";
    const directoryId = "directoryKey";
    const stringId = "sharedStringKey";
    const codeDetails: IFluidCodeDetails = {
        package: "documentDirtyTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let documentServiceFactory: TestDocumentServiceFactory;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let firstContainer: Container;
    let firstContainerClientId: string;
    let firstContainerComp1: ITestFluidComponent & IComponentLoadable;
    let firstContainerComp1ContainerRuntime: IContainerRuntime;
    let firstContainerComp1Map1: SharedMap;
    let wasMarkedDirty: boolean;
    let wasMarkedClean: boolean;

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(container: Container): Promise<void> {
        await new Promise((resolve) => container.once("connected", () => resolve()));
    }

    async function waitForMarkedDirty(runtime: IContainerRuntime): Promise<void> {
        await new Promise((resolve) => runtime.once("dirtyDocument", () => {
            wasMarkedDirty = true;
            resolve();
        }));
    }

    async function waitForMarkedClean(runtime: IContainerRuntime): Promise<void> {
        await new Promise((resolve) => runtime.once("savedDocument", () => {
            wasMarkedClean = true;
            resolve();
        }));
    }

    async function createContainer(): Promise<Container> {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory(
            [
                [ map1Id, SharedMap.getFactory() ],
                [ map2Id, SharedMap.getFactory() ],
                [ directoryId, SharedDirectory.getFactory() ],
                [ stringId, SharedString.getFactory() ],
            ],
        );

        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultComponent(
                "default",
                [
                    ["default", Promise.resolve(factory)],
                    ["component2", Promise.resolve(factory)],
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
        firstContainerComp1 = await getComponent("default", firstContainer);
        firstContainerComp1ContainerRuntime = firstContainerComp1.context.containerRuntime as IContainerRuntime;
        firstContainerComp1Map1 = await firstContainerComp1.getSharedObject<SharedMap>(map1Id);
        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(firstContainerComp1.runtime);

        wasMarkedClean = false;
        wasMarkedDirty = false;
    });

    describe("Dirty state is updated correctly while in connected state", () => {
        it("marked dirty when ops are sent and clean when acks are received", async () => {
            // Set values in DDSes in disconnected state.
            firstContainerComp1Map1.set("key1", "value1");

            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), true);

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), false);
        });
    });

    describe("Dirty state is updated correctly while in disconnected state", () => {
        it(`mark false when disconnected, true when ops are sent, false again after
            the ops are processed after reconnecting`, async () => {
            firstContainerClientId = firstContainer.clientId;

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), false);

            // Set values in DDSes in disconnected state.
            firstContainerComp1Map1.set("key1", "value1");

            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), true);

            // Wait for the Container to get reconnected.
            await Promise.all([
                waitForContainerReconnection(firstContainer),
                waitForMarkedClean(firstContainerComp1ContainerRuntime),
                waitForMarkedDirty(firstContainerComp1ContainerRuntime),
            ]);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedClean, true);

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirty, true);

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), true);

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), false);
        });

        it(`marked dirty when ops are sent while connected and not set clean until 
            they are acked after reconnection`, async () => {
            firstContainerClientId = firstContainer.clientId;

            // Set values in DDSes in disconnected state.
            firstContainerComp1Map1.set("key1", "value1");

            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), true);

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), true);

            // Wait for the Container to get reconnected.
            await Promise.all([
                waitForContainerReconnection(firstContainer),
                waitForMarkedClean(firstContainerComp1ContainerRuntime),
                waitForMarkedDirty(firstContainerComp1ContainerRuntime),
            ]);

            // Document will have been marked clean on reconnection
            assert.equal(wasMarkedClean, true);

            // Document should have been marked dirty again due to pending DDS ops
            assert.equal(wasMarkedDirty, true);

            // Document should have been marked dirty after to overwrite the clean value, so that the final
            // state is dirty
            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), true);

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            assert.equal(firstContainerComp1ContainerRuntime.isDocumentDirty(), false);
        });
    });
});
