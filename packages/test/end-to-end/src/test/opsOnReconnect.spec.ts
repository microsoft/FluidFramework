/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
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

    async function setupSecondContainersComponent(clientId: string, receivedKeyValues: [string, string][]):
    Promise<ITestFluidComponent> {
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

        return secondContainerComp1;
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

    describe("Ops on Container reconnect", () => {
        it("can resend ops on reconnection that were sent in disconnected state", async () => {
            const clientId = firstContainer.clientId;
            const receivedKeyValues: [string, string][] = [];

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent(clientId, receivedKeyValues);

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
            const receivedKeyValues: [string, string][] = [];

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent(clientId, receivedKeyValues);

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

    describe("Op ordering on Container reconnect", () => {
        it("can send ops in a component in right order on connect", async () => {
            const clientId = firstContainer.clientId;
            const receivedKeyValues: [string, string][] = [];

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent(clientId, receivedKeyValues);

            // Disconnect the client.
            documentServiceFactory.disconnectClient(clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

            // Set values in each DDS interleaved with each other.
            firstContainerComp1Map1.set("key1", "value1");
            firstContainerComp1Map2.set("key2", "value2");
            firstContainerComp1Directory.set("key3", "value3");
            firstContainerComp1Map1.set("key4", "value4");
            firstContainerComp1Map2.set("key5", "value5");
            firstContainerComp1Directory.set("key6", "value6");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(firstContainer);

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            const expectedKeyValues: string[][] = [
                [ "key1", "value1" ],
                [ "key2", "value2" ],
                [ "key3", "value3" ],
                [ "key4", "value4" ],
                [ "key5", "value5" ],
                [ "key6", "value6" ],
            ];
            assert.deepStrictEqual(expectedKeyValues, receivedKeyValues);
        });

        it("can send ops in multiple components in right order on connect", async () => {
            // Create component2 in the first container.
            const firstContainerComp2 =
                await firstContainerComp1.context.createComponentWithRealizationFn(
                    "component2",
                ) as unknown as ITestFluidComponent & IComponentLoadable;
            containerDeltaEventManager.registerDocuments(firstContainerComp2.runtime);
            firstContainerComp1Map1.set("component2Key", firstContainerComp2.handle);

            // Get the maps in component2.
            const firstContainerComp2Map1 = await firstContainerComp2.getSharedObject<SharedMap>(map1Id);
            const firstContainerComp2Map2 = await firstContainerComp2.getSharedObject<SharedMap>(map2Id);

            const clientId = firstContainer.clientId;
            const receivedKeyValues: [string, string][] = [];

            // Create a second container and set up a listener to store the received map / directory values.
            const secondContainerComp1 = await setupSecondContainersComponent(clientId, receivedKeyValues);

            // Get component2 in the second container.
            const secondContainerComp1Map1 = await secondContainerComp1.getSharedObject<SharedMap>(map1Id);
            const secondContainerComp2 =
                await secondContainerComp1Map1.get<
                IComponentHandle<ITestFluidComponent & IComponentLoadable>>("component2Key").get();
            containerDeltaEventManager.registerDocuments(secondContainerComp2.runtime);

            // Disconnect the client.
            documentServiceFactory.disconnectClient(clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

            // Set values in the DDSes across the two components interleaved with each other.
            firstContainerComp1Map1.set("key1", "value1");
            firstContainerComp2Map1.set("key2", "value2");
            firstContainerComp1Map2.set("key3", "value3");
            firstContainerComp2Map2.set("key4", "value4");
            firstContainerComp1Map1.set("key5", "value5");
            firstContainerComp2Map1.set("key6", "value6");
            firstContainerComp1Map2.set("key7", "value7");
            firstContainerComp2Map2.set("key8", "value8");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(firstContainer);

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            const expectedKeyValues: string[][] = [
                [ "key1", "value1" ],
                [ "key2", "value2" ],
                [ "key3", "value3" ],
                [ "key4", "value4" ],
                [ "key5", "value5" ],
                [ "key6", "value6" ],
                [ "key7", "value7" ],
                [ "key8", "value8" ],
            ];
            assert.deepStrictEqual(expectedKeyValues, receivedKeyValues);
        });
    });

    describe("Op batching on Container reconnect", () => {
        it("can send batch ops in a component in right order on attach", async () => {
            const clientId = firstContainer.clientId;
            const receivedKeyValues: [string, string, boolean | undefined][] = [];

            // Create a second container and set up a listener to store the received map / directory values.
            const secondContainer = await createContainer();
            secondContainer.on("op", (message: ISequencedDocumentMessage) => {
                if (message.type === MessageType.Operation) {
                    const envelope = message.contents as IEnvelope;
                    if (envelope.address !== "_scheduler") {
                        // The client ID of firstContainer should have changed on disconnect.
                        assert.notEqual(message.clientId, clientId, "The clientId did not change after disconnect");

                        const content = message.contents.contents.content.contents;
                        const key = content.key;
                        const value = content.value.value;
                        const batch = message.metadata?.batch;
                        receivedKeyValues.push([ key, value, batch ]);
                    }
                }
            });

            // Get component1 on the second container.
            const secondContainerComp1 = await getComponent("default", secondContainer);
            containerDeltaEventManager.registerDocuments(secondContainerComp1.runtime);

            await containerDeltaEventManager.process();

            // Disconnect the client.
            documentServiceFactory.disconnectClient(clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

            // Set values in the DDSes in orderSequentially so that they are batched together.
            firstContainerComp1.context.containerRuntime.orderSequentially(() => {
                firstContainerComp1Map1.set("key1", "value1");
                firstContainerComp1Map2.set("key2", "value2");
                firstContainerComp1Directory.set("key3", "value3");
            });

            firstContainerComp1.context.containerRuntime.orderSequentially(() => {
                firstContainerComp1Map1.set("key4", "value4");
                firstContainerComp1Map2.set("key5", "value5");
                firstContainerComp1Directory.set("key6", "value6");
            });

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(firstContainer);

            // Wait for the ops to get processed by both the containers.
            await containerDeltaEventManager.process();

            const expectedKeyValues: [string, string, boolean | undefined][] = [
                [ "key1", "value1", true ],
                [ "key2", "value2", undefined ],
                [ "key3", "value3", false ],
                [ "key4", "value4", true ],
                [ "key5", "value5", undefined ],
                [ "key6", "value6", false ],
            ];
            assert.deepStrictEqual(expectedKeyValues, receivedKeyValues);
        });
    });
});
