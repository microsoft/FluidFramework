/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { ConnectionState, Container, Loader } from "@fluidframework/container-loader";
import {
    ContainerMessageType,
    isRuntimeMessage,
    unpackRuntimeMessage,
    taskSchedulerId,
} from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidCodeDetails, IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IEnvelope, FlushMode } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { SharedString } from "@fluidframework/sequence";
import {
    createAndAttachContainer,
    ITestFluidObject,
    LocalCodeLoader,
    OpProcessingController,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";

describe("Ops on Reconnect", () => {
    const documentId = "opsOnReconnectTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const map1Id = "map1Key";
    const map2Id = "map2Key";
    const directoryId = "directoryKey";
    const stringId = "sharedStringKey";
    const codeDetails: IFluidCodeDetails = {
        package: "opsOnReconnectTestPackage",
        config: {},
    };

    let urlResolver: IUrlResolver;
    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let documentServiceFactory: LocalDocumentServiceFactory;
    let opProcessingController: OpProcessingController;
    let container1: Container;
    let container1Object1: ITestFluidObject & IFluidLoadable;
    let container1Object1Map1: SharedMap;
    let container1Object1Map2: SharedMap;
    let container1Object1Directory: SharedDirectory;
    let container1Object1String: SharedString;
    let receivedValues: any[] = [];

    /**
     * Waits for the "connected" event from the given container.
     */
    async function waitForContainerReconnection(container: Container): Promise<void> {
        await new Promise((resolve) => container.once("connected", () => resolve()));
    }

    async function createLoader(): Promise<ILoader> {
        const factory: TestFluidObjectFactory = new TestFluidObjectFactory(
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
                    ["dataObject2", Promise.resolve(factory)],
                ],
            );

        const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

        return new Loader({
            urlResolver,
            documentServiceFactory,
            codeLoader,
        });
    }

    async function createContainer(): Promise<IContainer> {
        const loader = await createLoader();
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
    }

    async function setupSecondContainersDataObject(): Promise<ITestFluidObject> {
        const loader = await createLoader();
        const container2 = await loader.resolve({ url: documentLoadUrl });
        container2.on("op", (containerMessage: ISequencedDocumentMessage) => {
            if (!isRuntimeMessage(containerMessage)) {
                return;
            }
            const message = unpackRuntimeMessage(containerMessage);
            if (message.type === ContainerMessageType.FluidDataStoreOp) {
                const envelope = message.contents as IEnvelope;
                if (envelope.address !== taskSchedulerId) {
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

        // Get dataStore1 on the second container.
        const container2Object1 = await requestFluidObject<ITestFluidObject & IFluidLoadable>(
            container2,
            "default");
        opProcessingController.addDeltaManagers(container2Object1.runtime.deltaManager);

        return container2Object1;
    }

    beforeEach(async () => {
        urlResolver = new LocalResolver();
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);

        // Create the first container, dataObject and DDSes.
        container1 = await createContainer() as Container;
        container1Object1 = await requestFluidObject<ITestFluidObject & IFluidLoadable>(
            container1,
            "default");
        container1Object1Map1 = await container1Object1.getSharedObject<SharedMap>(map1Id);
        container1Object1Map2 = await container1Object1.getSharedObject<SharedMap>(map2Id);
        container1Object1Directory = await container1Object1.getSharedObject<SharedDirectory>(directoryId);
        container1Object1String = await container1Object1.getSharedObject<SharedString>(stringId);

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(container1Object1.runtime.deltaManager);

        // Wait for the attach ops to get processed.
        await opProcessingController.process();
    });

    describe("Ops on Container reconnect", () => {
        it("can resend ops on reconnection that were sent in disconnected state", async () => {
            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersDataObject();

            // Disconnect the client.
            assert(container1.clientId);
            documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Set values in DDSes in disconnected state.
            container1Object1Map1.set("key1", "value1");
            container1Object1Map1.set("key2", "value2");
            container1Object1Map2.set("key3", "value3");
            container1Object1Map2.set("key4", "value4");
            container1Object1String.insertText(0, "value5");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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
            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersDataObject();

            // Nack the client.
            assert(container1.clientId);
            documentServiceFactory.nackClient(container1.clientId);

            // The Container should be in disconnected state because DeltaManager disconnects on getting Nack'd.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Set values in DDSes in disconnected state.
            container1Object1Map1.set("key1", "value1");
            container1Object1Map1.set("key2", "value2");
            container1Object1Directory.set("key3", "value3");
            container1Object1Directory.set("key4", "value4");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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
        it("can resend ops in a dataObject in right order on reconnect", async () => {
            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersDataObject();

            // Disconnect the client.
            assert(container1.clientId);
            documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Set values in each DDS interleaved with each other.
            container1Object1Map1.set("key1", "value1");
            container1Object1Map2.set("key2", "value2");
            container1Object1Directory.set("key3", "value3");
            container1Object1Map1.set("key4", "value4");
            container1Object1Map2.set("key5", "value5");
            container1Object1Directory.set("key6", "value6");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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

        it("can resend ops in multiple dataObjects in right order on reconnect", async () => {
            // Create dataObject2 in the first container.
            const container1Object2 = await requestFluidObject<ITestFluidObject & IFluidLoadable>(
                await container1Object1.context.containerRuntime.createDataStore("dataObject2"),
                "/");

            // Get the maps in dataStore2.
            const container1Object2Map1 = await container1Object2.getSharedObject<SharedMap>(map1Id);
            const container1Object2Map2 = await container1Object2.getSharedObject<SharedMap>(map2Id);

            // Set the new dataStore's handle in a map so that a new container has access to it.
            container1Object1Map1.set("dataStore2Key", container1Object2.handle);

            // Wait for the set above to get processed.
            await opProcessingController.process();

            // Create a second container and set up a listener to store the received map / directory values.
            const container2Object1 = await setupSecondContainersDataObject();

            // Get dataObject2 in the second container.
            const container2Object1Map1 = await container2Object1.getSharedObject<SharedMap>(map1Id);
            const container2Object2 =
                await container2Object1Map1.get<
                    IFluidHandle<ITestFluidObject & IFluidLoadable>>("dataStore2Key").get();
            assert.ok(container2Object2, "Could not get dataStore2 in the second container");

            // Disconnect the client.
            assert(container1.clientId);
            documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Set values in the DDSes across the two dataStores interleaved with each other.
            container1Object1Map1.set("key1", "value1");
            container1Object2Map1.set("key2", "value2");
            container1Object1Map2.set("key3", "value3");
            container1Object2Map2.set("key4", "value4");
            container1Object1Map1.set("key5", "value5");
            container1Object2Map1.set("key6", "value6");
            container1Object1Map2.set("key7", "value7");
            container1Object2Map2.set("key8", "value8");

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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
        it("can resend ops in a dataObject in right order on connect", async () => {
            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersDataObject();

            // Set values in each DDS interleaved with each other.
            container1Object1Map1.set("key1", "value1");
            container1Object1Map2.set("key2", "value2");
            container1Object1Directory.set("key3", "value3");
            container1Object1Map1.set("key4", "value4");
            container1Object1Map2.set("key5", "value5");
            container1Object1Directory.set("key6", "value6");

            // Disconnect the client.
            assert(container1.clientId);
            documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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

        it("can resend ops in multiple dataObjects in right order on connect", async () => {
            // Create dataObject2 in the first container.
            const container1Object2 = await requestFluidObject<ITestFluidObject & IFluidLoadable>(
                await container1Object1.context.containerRuntime.createDataStore("dataObject2"),
                "/");

            // Get the maps in dataStore2.
            const container1Object2Map1 = await container1Object2.getSharedObject<SharedMap>(map1Id);
            const container1Object2Map2 = await container1Object2.getSharedObject<SharedMap>(map2Id);

            // Set the new dataStore's handle in a map so that a new container has access to it.
            container1Object1Map1.set("dataStore2Key", container1Object2.handle);

            // Wait for the set above to get processed.
            await opProcessingController.process();

            // Create a second container and set up a listener to store the received map / directory values.
            const container2Object1 = await setupSecondContainersDataObject();

            // Get dataObject2 in the second container.
            const container2Object1Map1 = await container2Object1.getSharedObject<SharedMap>(map1Id);
            const container2Object2 =
                await container2Object1Map1.get<
                    IFluidHandle<ITestFluidObject & IFluidLoadable>>("dataStore2Key").get();
            assert.ok(container2Object2, "Could not get dataStore2 in the second container");

            // Set values in the DDSes across the two dataStores interleaved with each other.
            container1Object1Map1.set("key1", "value1");
            container1Object2Map1.set("key2", "value2");
            container1Object1Map2.set("key3", "value3");
            container1Object2Map2.set("key4", "value4");
            container1Object1Map1.set("key5", "value5");
            container1Object2Map1.set("key6", "value6");
            container1Object1Map2.set("key7", "value7");
            container1Object2Map2.set("key8", "value8");

            // Disconnect the client.
            assert(container1.clientId);
            documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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
        it("can resend batch ops in a dataObject in right order on connect", async () => {
            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersDataObject();

            // Disconnect the client.
            assert(container1.clientId);
            documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Set values in the DDSes in orderSequentially so that they are batched together.
            container1Object1.context.containerRuntime.orderSequentially(() => {
                container1Object1Map1.set("key1", "value1");
                container1Object1Map2.set("key2", "value2");
                container1Object1Directory.set("key3", "value3");
            });

            container1Object1.context.containerRuntime.orderSequentially(() => {
                container1Object1Map1.set("key4", "value4");
                container1Object1Map2.set("key5", "value5");
                container1Object1Directory.set("key6", "value6");
            });

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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
            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersDataObject();

            // Disconnect the client.
            assert(container1.clientId);
            documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Set the FlushMode to Manual to send batch ops by manually flushing them.
            container1Object1.context.containerRuntime.setFlushMode(FlushMode.Manual);

            // Set values in the DDSes so that they are batched together.
            container1Object1Map1.set("key1", "value1");
            container1Object1Map2.set("key2", "value2");
            container1Object1Directory.set("key3", "value3");

            // Manually flush the ops so that they are sent as a batch.
            (container1Object1.context.containerRuntime as IContainerRuntime).flush();

            // Set values in the DDSes so that they are batched together in a second batch.
            container1Object1Map1.set("key4", "value4");
            container1Object1Map2.set("key5", "value5");
            container1Object1Directory.set("key6", "value6");

            // Set the FlushMode back to Automatic so that the above batch is sent.
            container1Object1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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
            // Create a second container and set up a listener to store the received map / directory values.
            await setupSecondContainersDataObject();

            // Disconnect the client.
            assert(container1.clientId);
            documentServiceFactory.disconnectClient(container1.clientId, "Disconnected for testing");

            // The Container should be in disconnected state.
            assert.equal(container1.connectionState, ConnectionState.Disconnected);

            // Set the FlushMode to Manual to send batch ops by manually flushing them.
            container1Object1.context.containerRuntime.setFlushMode(FlushMode.Manual);

            // Set values in the DDSes so that they are batched together.
            container1Object1Map1.set("key1", "value1");
            container1Object1Map2.set("key2", "value2");
            container1Object1Directory.set("key3", "value3");

            // Manually flush the ops so that they are sent as a batch.
            (container1Object1.context.containerRuntime as IContainerRuntime).flush();

            // Set the FlushMode back to Automatic.
            container1Object1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

            // Wait for the Container to get reconnected.
            await waitForContainerReconnection(container1);

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
