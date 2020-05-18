/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { DocumentDeltaEventManager, TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { SharedMap, SharedDirectory } from "@microsoft/fluid-map";
import { MessageType, ISequencedDocumentMessage, ConnectionState } from "@microsoft/fluid-protocol-definitions";
import { IEnvelope } from "@microsoft/fluid-runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    LocalCodeLoader,
    initializeLocalContainer,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@microsoft/fluid-test-utils";

describe("Ops on Reconnect", () => {
    const id = `fluid-test://localhost/opsOnReconnectTest`;
    const map1Id = "map1Key";
    const map2Id = "map2Key";
    const directoryId = "directoryKey";
    const codeDetails: IFluidCodeDetails = {
        package: "opsOnReconnectTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let documentServiceFactory: TestDocumentServiceFactory;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let firstContainer: Container;
    let firstContainerComp1: ITestFluidComponent & IComponentLoadable;
    let firstContainerComp1Map1: SharedMap;
    let firstContainerComp1Map2: SharedMap;
    let firstContainerComp1Directory: SharedDirectory;

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(container: Container): Promise<void> {
        await new Promise((resolve) => container.once("connected", () => resolve()));
    }

    async function createContainer(): Promise<Container> {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory(
            [
                [ map1Id, SharedMap.getFactory() ],
                [ map2Id, SharedMap.getFactory() ],
                [ directoryId, SharedDirectory.getFactory() ],
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
        firstContainerComp1 = await getComponent("default", firstContainer);
        firstContainerComp1Map1 = await firstContainerComp1.getSharedObject<SharedMap>(map1Id);
        firstContainerComp1Map2 = await firstContainerComp1.getSharedObject<SharedMap>(map2Id);
        firstContainerComp1Directory = await firstContainerComp1.getSharedObject<SharedDirectory>(directoryId);

        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(firstContainerComp1.runtime);
    });

    it("can resend ops on reconnection that were sent in disconnected state", async () => {
        const clientId = firstContainer.clientId;

        // Create a second container and set up a listener to store the received map / directory values.
        const receivedKeyValues: [string, string][] = [];
        const secondContainer = await createContainer();
        secondContainer.on("op", (message: ISequencedDocumentMessage) => {
            if (message.type === MessageType.Operation) {
                const envelope = message.contents as IEnvelope;
                if (envelope.address !== "_scheduler") {
                    // The client ID of firstContainer should have changed on disconnect.
                    assert.notEqual(message.clientId, clientId, "The clientId did not change after disconnect");

                    const content = envelope.contents.content.contents;
                    const key = content.key;
                    const value = content.value.value;
                    receivedKeyValues.push([ key, value ]);
                }
            }
        });

        // Get component1 on the second container.
        const secondContainerComp1 = await getComponent("default", secondContainer);
        containerDeltaEventManager.registerDocuments(secondContainerComp1.runtime);

        // Disconnect the client.
        documentServiceFactory.disconnectClient(clientId, "Disconnected for testing");

        // The Container should be in disconnected state.
        assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

        // Set values in DDSes in disconnected state.
        firstContainerComp1Map1.set("key1", "value1");
        firstContainerComp1Map1.set("key2", "value2");
        firstContainerComp1Map2.set("key3", "value3");
        firstContainerComp1Map2.set("key4", "value4");

        // Wait for the Container to get reconnected.
        await waitForContainerReconnection(firstContainer);

        // Wait for the ops to get processed by both the containers.
        await containerDeltaEventManager.process();

        const expectedKeyValues: string[][] = [
            [ "key1", "value1" ],
            [ "key2", "value2" ],
            [ "key3", "value3" ],
            [ "key4", "value4" ],
        ];
        assert.deepStrictEqual(
            expectedKeyValues, receivedKeyValues, "Did not receive the ops that were sent in disconnected state");
    });

    it("can resend ops on reconnection that were sent in Nack'd state", async () => {
        const clientId = firstContainer.clientId;

        // Create a second container and set up a listener to store the received map / directory values.
        const receivedKeyValues: [string, string][] = [];
        const secondContainer = await createContainer();
        secondContainer.on("op", (message: ISequencedDocumentMessage) => {
            if (message.type === MessageType.Operation) {
                const envelope = message.contents as IEnvelope;
                if (envelope.address !== "_scheduler") {
                    // The client ID of firstContainer should have changed on disconnect.
                    assert.notEqual(message.clientId, clientId, "The clientId did not change after disconnect");

                    const content = envelope.contents.content.contents;
                    const key = content.key;
                    const value = content.value.value;
                    receivedKeyValues.push([ key, value ]);
                }
            }
        });

        // Get component1 on the second container.
        const secondContainerComp1 = await getComponent("default", secondContainer);
        containerDeltaEventManager.registerDocuments(secondContainerComp1.runtime);

        // Nack the client.
        documentServiceFactory.nackClient(clientId);

        // The Container should be in disconnected state because DeltaManager disconnects on getting Nack'd.
        assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

        // Set values in DDSes in disconnected state.
        firstContainerComp1Map1.set("key1", "value1");
        firstContainerComp1Map1.set("key2", "value2");
        firstContainerComp1Directory.set("key3", "value3");
        firstContainerComp1Directory.set("key4", "value4");

        // Wait for the Container to get reconnected.
        await waitForContainerReconnection(firstContainer);

        // Wait for the ops to get processed by both the containers.
        await containerDeltaEventManager.process();

        const expectedKeyValues: string[][] = [
            [ "key1", "value1" ],
            [ "key2", "value2" ],
            [ "key3", "value3" ],
            [ "key4", "value4" ],
        ];
        assert.deepStrictEqual(
            expectedKeyValues, receivedKeyValues, "Did not receive the ops that were sent in Nack'd state");
    });
});
