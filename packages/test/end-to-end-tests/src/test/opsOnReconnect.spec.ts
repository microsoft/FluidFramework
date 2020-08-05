/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { ISequencedDocumentMessage, ConnectionState } from "@fluidframework/protocol-definitions";
import { IEnvelope, SchedulerType, FlushMode } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { SharedString } from "@fluidframework/sequence";
import {
    LocalCodeLoader,
    OpProcessingController,
    initializeLocalContainer,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import {
    ContainerMessageType,
    isRuntimeMessage,
    unpackRuntimeMessage,
} from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";

describe("Ops on Reconnect", () => {
    const id = `fluid-test://localhost/opsOnReconnectTest`;
    const map1Id = "map1Key";
    const map2Id = "map2Key";
    const directoryId = "directoryKey";
    const stringId = "sharedStringKey";
    const codeDetails: IFluidCodeDetails = {
        package: "opsOnReconnectTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let documentServiceFactory: LocalDocumentServiceFactory;
    let opProcessingController: OpProcessingController;
    let firstContainer: Container;
    let firstContainerClientId: string;
    let firstContainerComp1: ITestFluidComponent & IFluidLoadable;
    let firstContainerComp1Map1: SharedMap;
    let firstContainerComp1Map2: SharedMap;
    let firstContainerComp1Directory: SharedDirectory;
    let firstContainerComp1String: SharedString;
    let receivedValues: any[] = [];

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(container: Container): Promise<void> {
        await new Promise((resolve) => container.once("connected", () => resolve()));
    }

    async function createContainer(): Promise<Container> {
        const factory: TestFluidComponentFactory = new TestFluidComponentFactory(
            [
                [map1Id, SharedMap.getFactory()],
                [map2Id, SharedMap.getFactory()],
                [directoryId, SharedDirectory.getFactory()],
                [stringId, SharedString.getFactory()],
            ],
        );

        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                "default",
                [
                    ["default", Promise.resolve(factory)],
                    ["component2", Promise.resolve(factory)],
                ],
            );

        const urlResolver = new LocalResolver();
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

    async function setupSecondContainersComponent(): Promise<ITestFluidComponent> {
        const secondContainer = await createContainer();
        secondContainer.on("op", (containerMessage: ISequencedDocumentMessage) => {
            if (!isRuntimeMessage(containerMessage)) {
                return;
            }
            const message = unpackRuntimeMessage(containerMessage);
            if (message.type === ContainerMessageType.FluidDataStoreOp) {
                const envelope = message.contents as IEnvelope;
                if (envelope.address !== `${SchedulerType}`) {
                    // The client ID of firstContainer should have changed on disconnect.
                    assert.notEqual(
                        message.clientId, firstContainerClientId, "The clientId did not change after disconnect");

                    const address = envelope.contents.content.address;
                    const content = envelope.contents.content.contents;
                    const batch = message.metadata?.batch;
                    let value1: string | number;
                    let value2: string;
                    // Add special handling for SharedString. SharedMap and SharedDirecory content structure is same.
                    if (address === stringId) {
                        value1 = content.pos1;
                        value2 = content.seg;
                    } else {
                        value1 = content.key;
                        value2 = content.value.value;
                    }
                    receivedValues.push([value1, value2, batch]);
                }
            }
        });

        // Get component1 on the second container.
        const secondContainerComp1 = await requestFluidObject<ITestFluidComponent & IFluidLoadable>(
            secondContainer,
            "default");
        opProcessingController.addDeltaManagers(secondContainerComp1.runtime.deltaManager);

        return secondContainerComp1;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);

        // Create the first container, component and DDSes.
        firstContainer = await createContainer();
        firstContainerComp1 = await requestFluidObject<ITestFluidComponent & IFluidLoadable>(
            firstContainer,
            "default");
        firstContainerComp1Map1 = await firstContainerComp1.getSharedObject<SharedMap>(map1Id);
        firstContainerComp1Map2 = await firstContainerComp1.getSharedObject<SharedMap>(map2Id);
        firstContainerComp1Directory = await firstContainerComp1.getSharedObject<SharedDirectory>(directoryId);
        firstContainerComp1String = await firstContainerComp1.getSharedObject<SharedString>(stringId);

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(firstContainerComp1.runtime.deltaManager);

        // Wait for the attach ops to get processed.
        await opProcessingController.process();
    });

    describe("Ops on Container reconnect", () => {
        it("can resend ops on reconnection that were sent in disconnected state", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent();

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

            // Set values in DDSes in disconnected state.
            firstContainerComp1Map1.set("key1", "value1");
            firstContainerComp1Map1.set("key2", "value2");
            firstContainerComp1Map2.set("key3", "value3");
            firstContainerComp1Map2.set("key4", "value4");
            firstContainerComp1String.insertText(0, "value5");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(firstContainer);

            // Wait for the ops to get processed by both the containers.
            await opProcessingController.process();

            const expectedValues = [
                ["key1", "value1", undefined /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", undefined /* batch */],
                ["key4", "value4", undefined /* batch */],
                [0, "value5", undefined /* batch */], // This is for the SharedString
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in disconnected state");
        });

        it("can resend ops on reconnection that were sent in Nack'd state", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent();

            // Nack the client.
            documentServiceFactory.nackClient(firstContainerClientId);

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
            await opProcessingController.process();

            const expectedValues = [
                ["key1", "value1", undefined /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", undefined /* batch */],
                ["key4", "value4", undefined /* batch */],
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in Nack'd state");
        });
    });

    describe("Ordering of ops that are sent in disconnected state", () => {
        it("can resend ops in a component in right order on reconnect", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent();

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

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
            await opProcessingController.process();

            const expectedValues = [
                ["key1", "value1", undefined /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", undefined /* batch */],
                ["key4", "value4", undefined /* batch */],
                ["key5", "value5", undefined /* batch */],
                ["key6", "value6", undefined /* batch */],
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in disconnected state");
        });

        it("can resend ops in multiple components in right order on reconnect", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create component2 in the first container.
            const firstContainerComp2 = await requestFluidObject<ITestFluidComponent & IFluidLoadable>(
                await firstContainerComp1.context.containerRuntime.createDataStore("component2"),
                "/");

            // Get the maps in component2.
            const firstContainerComp2Map1 = await firstContainerComp2.getSharedObject<SharedMap>(map1Id);
            const firstContainerComp2Map2 = await firstContainerComp2.getSharedObject<SharedMap>(map2Id);

            // Set the new component's handle in a map so that a new container has access to it.
            firstContainerComp1Map1.set("component2Key", firstContainerComp2.handle);

            // Create a second container and set up a listener to store the received map / directory values.
            const secondContainerComp1 = await setupSecondContainersComponent();

            // Wait for the set above to get processed.
            await opProcessingController.process();

            // Get component2 in the second container.
            const secondContainerComp1Map1 = await secondContainerComp1.getSharedObject<SharedMap>(map1Id);
            const secondContainerComp2 =
                await secondContainerComp1Map1.get<
                    IFluidHandle<ITestFluidComponent & IFluidLoadable>>("component2Key").get();
            assert.ok(secondContainerComp2, "Could not get component2 in the second container");

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

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
            await opProcessingController.process();

            const expectedValues = [
                ["key1", "value1", undefined /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", undefined /* batch */],
                ["key4", "value4", undefined /* batch */],
                ["key5", "value5", undefined /* batch */],
                ["key6", "value6", undefined /* batch */],
                ["key7", "value7", undefined /* batch */],
                ["key8", "value8", undefined /* batch */],
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in disconnected state");
        });
    });

    describe("Ordering of ops when disconnecting after ops are sent", () => {
        it("can resend ops in a component in right order on connect", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent();

            // Set values in each DDS interleaved with each other.
            firstContainerComp1Map1.set("key1", "value1");
            firstContainerComp1Map2.set("key2", "value2");
            firstContainerComp1Directory.set("key3", "value3");
            firstContainerComp1Map1.set("key4", "value4");
            firstContainerComp1Map2.set("key5", "value5");
            firstContainerComp1Directory.set("key6", "value6");

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(firstContainer);

            // Wait for the ops to get processed by both the containers.
            await opProcessingController.process();

            const expectedValues = [
                ["key1", "value1", undefined /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", undefined /* batch */],
                ["key4", "value4", undefined /* batch */],
                ["key5", "value5", undefined /* batch */],
                ["key6", "value6", undefined /* batch */],
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in disconnected state");
        });

        it("can resend ops in multiple components in right order on connect", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create component2 in the first container.
            const firstContainerComp2 = await requestFluidObject<ITestFluidComponent & IFluidLoadable>(
                await firstContainerComp1.context.containerRuntime.createDataStore("component2"),
                "/");

            // Get the maps in component2.
            const firstContainerComp2Map1 = await firstContainerComp2.getSharedObject<SharedMap>(map1Id);
            const firstContainerComp2Map2 = await firstContainerComp2.getSharedObject<SharedMap>(map2Id);

            // Set the new component's handle in a map so that a new container has access to it.
            firstContainerComp1Map1.set("component2Key", firstContainerComp2.handle);

            // Create a second container and set up a listener to store the received map / directory values.
            const secondContainerComp1 = await setupSecondContainersComponent();

            // Wait for the set above to get processed.
            await opProcessingController.process();

            // Get component2 in the second container.
            const secondContainerComp1Map1 = await secondContainerComp1.getSharedObject<SharedMap>(map1Id);
            const secondContainerComp2 =
                await secondContainerComp1Map1.get<
                    IFluidHandle<ITestFluidComponent & IFluidLoadable>>("component2Key").get();
            assert.ok(secondContainerComp2, "Could not get component2 in the second container");

            // Set values in the DDSes across the two components interleaved with each other.
            firstContainerComp1Map1.set("key1", "value1");
            firstContainerComp2Map1.set("key2", "value2");
            firstContainerComp1Map2.set("key3", "value3");
            firstContainerComp2Map2.set("key4", "value4");
            firstContainerComp1Map1.set("key5", "value5");
            firstContainerComp2Map1.set("key6", "value6");
            firstContainerComp1Map2.set("key7", "value7");
            firstContainerComp2Map2.set("key8", "value8");

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(firstContainer);

            // Wait for the ops to get processed by both the containers.
            await opProcessingController.process();

            const expectedValues = [
                ["key1", "value1", undefined /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", undefined /* batch */],
                ["key4", "value4", undefined /* batch */],
                ["key5", "value5", undefined /* batch */],
                ["key6", "value6", undefined /* batch */],
                ["key7", "value7", undefined /* batch */],
                ["key8", "value8", undefined /* batch */],
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in disconnected state");
        });
    });

    describe("Op batching on Container reconnect", () => {
        it("can resend batch ops in a component in right order on connect", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent();

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

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
            await opProcessingController.process();

            const expectedValues: [string, string, boolean | undefined][] = [
                ["key1", "value1", true /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", false /* batch */],
                ["key4", "value4", true /* batch */],
                ["key5", "value5", undefined /* batch */],
                ["key6", "value6", false /* batch */],
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in disconnected state");
        });

        it("can resend consecutive manually flushed batches in right order on connect", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent();

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

            // Set the FlushMode to Manual to send batch ops by manually flushing them.
            firstContainerComp1.context.containerRuntime.setFlushMode(FlushMode.Manual);

            // Set values in the DDSes so that they are batched together.
            firstContainerComp1Map1.set("key1", "value1");
            firstContainerComp1Map2.set("key2", "value2");
            firstContainerComp1Directory.set("key3", "value3");

            // Manually flush the ops so that they are sent as a batch.
            (firstContainerComp1.context.containerRuntime as IContainerRuntime).flush();

            // Set values in the DDSes so that they are batched together in a second batch.
            firstContainerComp1Map1.set("key4", "value4");
            firstContainerComp1Map2.set("key5", "value5");
            firstContainerComp1Directory.set("key6", "value6");

            // Set the FlushMode back to Automatic so that the above batch is sent.
            firstContainerComp1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(firstContainer);

            // Wait for the ops to get processed by both the containers.
            await opProcessingController.process();

            const expectedValues: [string, string, boolean | undefined][] = [
                ["key1", "value1", true /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", false /* batch */],
                ["key4", "value4", true /* batch */],
                ["key5", "value5", undefined /* batch */],
                ["key6", "value6", false /* batch */],
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in disconnected state");
        });

        it("can resend manually flushed batch in right order on connect", async () => {
            firstContainerClientId = firstContainer.clientId;

            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersComponent();

            // Disconnect the client.
            documentServiceFactory.disconnectClient(firstContainerClientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(firstContainer.connectionState, ConnectionState.Disconnected);

            // Set the FlushMode to Manual to send batch ops by manually flushing them.
            firstContainerComp1.context.containerRuntime.setFlushMode(FlushMode.Manual);

            // Set values in the DDSes so that they are batched together.
            firstContainerComp1Map1.set("key1", "value1");
            firstContainerComp1Map2.set("key2", "value2");
            firstContainerComp1Directory.set("key3", "value3");

            // Manually flush the ops so that they are sent as a batch.
            (firstContainerComp1.context.containerRuntime as IContainerRuntime).flush();

            // Set the FlushMode back to Automatic.
            firstContainerComp1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(firstContainer);

            // Wait for the ops to get processed by both the containers.
            await opProcessingController.process();

            const expectedValues: [string, string, boolean | undefined][] = [
                ["key1", "value1", true /* batch */],
                ["key2", "value2", undefined /* batch */],
                ["key3", "value3", false /* batch */],
            ];
            assert.deepStrictEqual(
                expectedValues, receivedValues, "Did not receive the ops that were sent in disconnected state");
        });
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
        receivedValues = [];
    });
});
