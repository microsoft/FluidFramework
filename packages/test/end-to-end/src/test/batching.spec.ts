/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { SharedMap } from "@fluidframework/map";
import { MessageType, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IEnvelope } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    initializeLocalContainer,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";

describe("Batching", () => {
    const id = `fluid-test://localhost/batchingTest`;
    const map1Id = "map1Key";
    const map2Id = "map2Key";
    const codeDetails: IFluidCodeDetails = {
        package: "batchingTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let component1: ITestFluidComponent;
    let component2: ITestFluidComponent;
    let component1map1: SharedMap;
    let component1map2: SharedMap;
    let component2map1: SharedMap;
    let component2map2: SharedMap;
    let component1BatchMessages: ISequencedDocumentMessage[] = [];
    let component2BatchMessages: ISequencedDocumentMessage[] = [];

    async function createContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory(
            [
                [map1Id, SharedMap.getFactory()],
                [map2Id, SharedMap.getFactory()],
            ],
        );
        const loader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    function setupBacthMessageListener(component: ITestFluidComponent, receivedMessages: ISequencedDocumentMessage[]) {
        component.context.containerRuntime.on("op", (message: ISequencedDocumentMessage) => {
            if (message.type === MessageType.Operation) {
                const envelope = message.contents as IEnvelope;
                if (envelope.address !== "_scheduler") {
                    receivedMessages.push(message);
                }
            }
        });
    }

    function verifyBatchMetadata(batchMessages: ISequencedDocumentMessage[]) {
        const batchCount = batchMessages.length;
        assert(batchCount !== 0, "No messages in the batch");

        const batchBeginMetadata = batchMessages[0].metadata?.batch;
        const batchEndMetadata = batchMessages[batchCount - 1].metadata?.batch;
        if (batchCount === 1) {
            assert.equal(batchBeginMetadata, undefined, "Batch with one message should not have batch metadata");
            return;
        }

        assert.equal(batchBeginMetadata, true, "Batch begin metadata not found");
        assert.equal(batchEndMetadata, false, "Batch end metadata not found");
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const container1 = await createContainer();
        component1 = await getComponent("default", container1);
        component1map1 = await component1.getSharedObject<SharedMap>(map1Id);
        component1map2 = await component1.getSharedObject<SharedMap>(map2Id);

        const container2 = await createContainer();
        component2 = await getComponent("default", container2);
        component2map1 = await component2.getSharedObject<SharedMap>(map1Id);
        component2map2 = await component2.getSharedObject<SharedMap>(map2Id);

        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);

        await containerDeltaEventManager.process();

        setupBacthMessageListener(component1, component1BatchMessages);
        setupBacthMessageListener(component2, component2BatchMessages);
    });

    it("can send and receive mulitple batch ops correctly", async () => {
        // Send messages in batch in the first component.
        component1.context.containerRuntime.orderSequentially(() => {
            component1map1.set("key1", "value1");
            component1map2.set("key2", "value2");
            component1map1.set("key3", "value3");
            component1map2.set("key4", "value4");
        });

        // Send a non-batch message after sending the batch so that PendingStateManager's processFlushState
        // algorithm can run on the batch.
        component1map1.set("key5", "value5");

        // Wait for the ops to get processed by both the containers.
        await containerDeltaEventManager.process();

        // Remove the additional non-batch message.
        component1BatchMessages.pop();
        component2BatchMessages.pop();

        assert.equal(component1BatchMessages.length, 4, "Incorrect number of messages received on local client");
        assert.equal(component2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

        verifyBatchMetadata(component1BatchMessages);
        verifyBatchMetadata(component2BatchMessages);
    });

    it("can send and receive single batch op correctly", async () => {
        component2.context.containerRuntime.orderSequentially(() => {
            component2map1.set("key1", "value1");
        });

        // Send a non-batch message after sending the batch so that PendingStateManager's processFlushState
        // algorithm can run on the batch.
        component2map2.set("key2", "value2");

        // Wait for the ops to get processed by both the containers.
        await containerDeltaEventManager.process();

        // Remove the additional non-batch message.
        component1BatchMessages.pop();
        component2BatchMessages.pop();

        assert.equal(component1BatchMessages.length, 1, "Incorrect number of messages received on local client");
        assert.equal(component2BatchMessages.length, 1, "Incorrect number of messages received on remote client");

        verifyBatchMetadata(component1BatchMessages);
        verifyBatchMetadata(component2BatchMessages);
    });

    it("can send and receive consecutive batches correctly", async () => {
        /**
         * This test verifies that among other things, the PendingStateManager's algorithm of handling consecutive
         * batches is correct.
         */
        component2.context.containerRuntime.orderSequentially(() => {
            component2map1.set("key1", "value1");
            component2map2.set("key2", "value2");
        });

        component2.context.containerRuntime.orderSequentially(() => {
            component2map1.set("key3", "value3");
            component2map2.set("key4", "value4");
        });

        // Send a non-batch message after sending the batch so that PendingStateManager's processFlushState
        // algorithm can run on the batch.
        component2map1.set("key5", "value5");

        // Wait for the ops to get processed by both the containers.
        await containerDeltaEventManager.process();

        // Remove the additional non-batch message.
        component1BatchMessages.pop();
        component2BatchMessages.pop();

        assert.equal(component1BatchMessages.length, 4, "Incorrect number of messages received on local client");
        assert.equal(component2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

        // Verify the first batch.
        verifyBatchMetadata(component1BatchMessages.slice(0, 2));
        verifyBatchMetadata(component1BatchMessages.slice(2, 4));

        // Verify the second batch.
        verifyBatchMetadata(component2BatchMessages.slice(0, 2));
        verifyBatchMetadata(component2BatchMessages.slice(2, 4));
    });

    it("can handle calls to orderSequentially with no batch messages", async () => {
        /**
         * This test verifies that among other things, the PendingStateManager's algorithm of handling batches with
         * no messages is correct.
         */
        component1.context.containerRuntime.orderSequentially(() => {
        });

        // Wait for the ops to get processed by both the containers.
        await containerDeltaEventManager.process();

        assert.equal(component1BatchMessages.length, 0, "Incorrect number of messages received on local client");
        assert.equal(component2BatchMessages.length, 0, "Incorrect number of messages received on remote client");
    });

    afterEach(() => {
        component1BatchMessages = [];
        component2BatchMessages = [];
    });
});
