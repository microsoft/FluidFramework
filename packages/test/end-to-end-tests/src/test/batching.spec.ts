/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ContainerMessageType, schedulerId } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IEnvelope, FlushMode } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    OpProcessingController,
    initializeLocalContainer,
    ITestFluidObject,
    TestFluidObjectFactory,
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
    let opProcessingController: OpProcessingController;
    let dataStore1: ITestFluidObject;
    let dataStore2: ITestFluidObject;
    let dataStore1map1: SharedMap;
    let dataStore1map2: SharedMap;
    let dataStore2map1: SharedMap;
    let dataStore2map2: SharedMap;

    async function createContainer(): Promise<Container> {
        const factory = new TestFluidObjectFactory(
            [
                [map1Id, SharedMap.getFactory()],
                [map2Id, SharedMap.getFactory()],
            ],
        );
        const loader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function requestFluidObject(dataStoreId: string, container: Container): Promise<ITestFluidObject> {
        const response = await container.request({ url: dataStoreId });
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            throw new Error(`DataStore with id: ${dataStoreId} not found`);
        }
        return response.value as ITestFluidObject;
    }

    function setupBacthMessageListener(dataStore: ITestFluidObject, receivedMessages: ISequencedDocumentMessage[]) {
        dataStore.context.containerRuntime.on("op", (message: ISequencedDocumentMessage) => {
            if (message.type === ContainerMessageType.FluidDataStoreOp) {
                const envelope = message.contents as IEnvelope;
                if (envelope.address !== schedulerId) {
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
        dataStore1 = await requestFluidObject("default", container1);
        dataStore1map1 = await dataStore1.getSharedObject<SharedMap>(map1Id);
        dataStore1map2 = await dataStore1.getSharedObject<SharedMap>(map2Id);

        const container2 = await createContainer();
        dataStore2 = await requestFluidObject("default", container2);
        dataStore2map1 = await dataStore2.getSharedObject<SharedMap>(map1Id);
        dataStore2map2 = await dataStore2.getSharedObject<SharedMap>(map2Id);

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(dataStore1.runtime.deltaManager, dataStore2.runtime.deltaManager);

        await opProcessingController.process();
    });

    describe("Local ops batch metadata verification", () => {
        let dataStore1BatchMessages: ISequencedDocumentMessage[] = [];
        let dataStore2BatchMessages: ISequencedDocumentMessage[] = [];

        beforeEach(() => {
            setupBacthMessageListener(dataStore1, dataStore1BatchMessages);
            setupBacthMessageListener(dataStore2, dataStore2BatchMessages);
        });

        describe("Automatic batches via orderSequentially", () => {
            it("can send and receive mulitple batch ops correctly", async () => {
                // Send messages in batch in the first dataStore.
                dataStore1.context.containerRuntime.orderSequentially(() => {
                    dataStore1map1.set("key1", "value1");
                    dataStore1map2.set("key2", "value2");
                    dataStore1map1.set("key3", "value3");
                    dataStore1map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                assert.equal(
                    dataStore1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    dataStore2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataStore1BatchMessages);
                verifyBatchMetadata(dataStore2BatchMessages);
            });

            it("can send and receive single batch op correctly", async () => {
                dataStore2.context.containerRuntime.orderSequentially(() => {
                    dataStore2map1.set("key1", "value1");
                });

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                assert.equal(
                    dataStore1BatchMessages.length, 1, "Incorrect number of messages received on local client");
                assert.equal(
                    dataStore2BatchMessages.length, 1, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataStore1BatchMessages);
                verifyBatchMetadata(dataStore2BatchMessages);
            });

            it("can send and receive consecutive batches correctly", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling
                 * consecutive batches is correct.
                 */
                dataStore2.context.containerRuntime.orderSequentially(() => {
                    dataStore2map1.set("key1", "value1");
                    dataStore2map2.set("key2", "value2");
                });

                dataStore2.context.containerRuntime.orderSequentially(() => {
                    dataStore2map1.set("key3", "value3");
                    dataStore2map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                assert.equal(
                    dataStore1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    dataStore2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                // Verify the local client's batches.
                verifyBatchMetadata(dataStore1BatchMessages.slice(0, 2));
                verifyBatchMetadata(dataStore1BatchMessages.slice(2, 4));

                // Verify the remote client's batches.
                verifyBatchMetadata(dataStore2BatchMessages.slice(0, 2));
                verifyBatchMetadata(dataStore2BatchMessages.slice(2, 4));
            });

            it("can handle calls to orderSequentially with no batch messages", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling batches
                 * with no messages is correct.
                 */
                dataStore1.context.containerRuntime.orderSequentially(() => {
                });

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                assert.equal(
                    dataStore1BatchMessages.length, 0, "Incorrect number of messages received on local client");
                assert.equal(
                    dataStore2BatchMessages.length, 0, "Incorrect number of messages received on remote client");
            });

            it("can handle nested orderSequentially by ignoring inner calls to it", async () => {
                // If orderSequentially is nested, only the outermost is considered as the beginning and end of the
                // batch. The inner ones are ignored.
                dataStore1.context.containerRuntime.orderSequentially(() => {
                    dataStore1map1.set("key1", "value1");
                    // Level 1 nesting.
                    dataStore1.context.containerRuntime.orderSequentially(() => {
                        dataStore1map2.set("key2", "value2");
                        // Level 2 nesting.
                        dataStore1.context.containerRuntime.orderSequentially(() => {
                            dataStore1map1.set("key3", "value3");
                        });
                    });
                    dataStore1map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                assert.equal(
                    dataStore1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    dataStore2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataStore1BatchMessages);
                verifyBatchMetadata(dataStore2BatchMessages);
            });
        });

        describe("Manually flushed batches", () => {
            it("can send and receive mulitple batch ops that are manually flushed", async () => {
                // Set the FlushMode to Manual.
                dataStore1.context.containerRuntime.setFlushMode(FlushMode.Manual);

                // Send the ops that are to be batched together.
                dataStore1map1.set("key1", "value1");
                dataStore1map2.set("key2", "value2");
                dataStore1map1.set("key3", "value3");
                dataStore1map2.set("key4", "value4");

                // Manually flush the batch.
                (dataStore1.context.containerRuntime as IContainerRuntime).flush();

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                assert.equal(
                    dataStore1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    dataStore2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataStore1BatchMessages);
                verifyBatchMetadata(dataStore2BatchMessages);
            });

            it("can send and receive single batch op that is manually flushed", async () => {
                // Manually flush a single message as a batch.
                dataStore2.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataStore2map1.set("key1", "value1");
                (dataStore2.context.containerRuntime as IContainerRuntime).flush();

                // Set the FlushMode back to Automatic.
                dataStore2.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                assert.equal(
                    dataStore1BatchMessages.length, 1, "Incorrect number of messages received on local client");
                assert.equal(
                    dataStore2BatchMessages.length, 1, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataStore1BatchMessages);
                verifyBatchMetadata(dataStore2BatchMessages);
            });

            it("can send and receive consecutive batches that are manually flushed", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling
                 * consecutive batches is correct.
                 */

                // Set the FlushMode to Manual.
                dataStore2.context.containerRuntime.setFlushMode(FlushMode.Manual);

                // Send the ops that are to be batched together.
                dataStore2map1.set("key1", "value1");
                dataStore2map2.set("key2", "value2");

                // Manually flush the batch.
                (dataStore2.context.containerRuntime as IContainerRuntime).flush();

                // Send the second set of ops that are to be batched together.
                dataStore2map1.set("key3", "value3");
                dataStore2map2.set("key4", "value4");

                // Manually flush the batch.
                (dataStore2.context.containerRuntime as IContainerRuntime).flush();

                // Send a third set of ops that are to be batched together.
                dataStore2map1.set("key5", "value5");
                dataStore2map2.set("key6", "value6");

                // Manually flush the batch.
                (dataStore2.context.containerRuntime as IContainerRuntime).flush();

                // Set the FlushMode back to Automatic.
                dataStore2.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                assert.equal(
                    dataStore1BatchMessages.length, 6, "Incorrect number of messages received on local client");
                assert.equal(
                    dataStore2BatchMessages.length, 6, "Incorrect number of messages received on remote client");

                // Verify the local client's batches.
                verifyBatchMetadata(dataStore1BatchMessages.slice(0, 2));
                verifyBatchMetadata(dataStore1BatchMessages.slice(2, 4));
                verifyBatchMetadata(dataStore1BatchMessages.slice(4, 6));

                // Verify the remote client's batches.
                verifyBatchMetadata(dataStore2BatchMessages.slice(0, 2));
                verifyBatchMetadata(dataStore2BatchMessages.slice(2, 4));
                verifyBatchMetadata(dataStore2BatchMessages.slice(4, 6));
            });
        });

        afterEach(async () => {
            dataStore1BatchMessages = [];
            dataStore2BatchMessages = [];
        });
    });

    describe("Document Dirty State", () => {
        // Verifies that the document dirty state for the given document is as expected.
        function verifyDocumentDirtyState(dataStore: ITestFluidObject, expectedState: boolean) {
            const dirty = (dataStore.context.containerRuntime as IContainerRuntime).isDocumentDirty();
            assert.equal(dirty, expectedState, "The document dirty state is not as expected");
        }

        describe("Automatic batches via orderSequentially", () => {
            it("should clean document dirty state after a batch with single message is sent", async () => {
                // Send a batch with a single message.
                dataStore1.context.containerRuntime.orderSequentially(() => {
                    dataStore1map1.set("key1", "value1");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataStore1, true);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataStore1, false);
            });

            it("should clean document dirty state after a batch with multiple messages is sent", async () => {
                // Send a batch with multiple messages.
                dataStore1.context.containerRuntime.orderSequentially(() => {
                    dataStore1map1.set("key1", "value1");
                    dataStore1map2.set("key2", "value2");
                    dataStore1map1.set("key3", "value3");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataStore1, true);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataStore1, false);
            });

            it("should clean document dirty state after consecutive batches are sent", async () => {
                // Send a couple of batches consecutively.
                dataStore1.context.containerRuntime.orderSequentially(() => {
                    dataStore1map1.set("key1", "value1");
                });

                dataStore1.context.containerRuntime.orderSequentially(() => {
                    dataStore1map2.set("key2", "value2");
                    dataStore1map1.set("key3", "value3");
                    dataStore1map2.set("key4", "value4");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataStore1, true);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                // Check that the document dirty state is cleaned after the ops are processed.
                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataStore1, false);
            });

            it("should clean document dirty state after batch and non-batch messages are sent", async () => {
                // Send a non-batch message.
                dataStore1map1.set("key1", "value1");

                // Send a couple of batches consecutively.
                dataStore1.context.containerRuntime.orderSequentially(() => {
                    dataStore1map2.set("key2", "value2");
                    dataStore1map1.set("key3", "value3");
                    dataStore1map2.set("key4", "value4");
                });

                dataStore1.context.containerRuntime.orderSequentially(() => {
                    dataStore1map1.set("key5", "value5");
                });

                // Send another non-batch message.
                dataStore1map1.set("key5", "value5");

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataStore1, true);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataStore1, false);
            });
        });

        describe("Manually flushed batches", () => {
            it("should clean document dirty state after a batch with single message is flushed", async () => {
                // Manually flush a single batch message.
                dataStore1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataStore1map1.set("key1", "value1");
                (dataStore1.context.containerRuntime as IContainerRuntime).flush();

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataStore1, true);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataStore1, false);
            });

            it("should clean document dirty state after a batch with multiple messages is flushed", async () => {
                // Manually flush a batch with multiple messages.
                dataStore1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataStore1map1.set("key1", "value1");
                dataStore1map2.set("key2", "value2");
                dataStore1map1.set("key3", "value3");
                (dataStore1.context.containerRuntime as IContainerRuntime).flush();
                dataStore1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataStore1, true);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataStore1, false);
            });

            it("should clean document dirty state after consecutive batches are flushed", async () => {
                // Flush a couple of batches consecutively.
                dataStore1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataStore1map1.set("key1", "value1");
                (dataStore1.context.containerRuntime as IContainerRuntime).flush();

                dataStore1map2.set("key2", "value2");
                dataStore1map1.set("key3", "value3");
                dataStore1map2.set("key4", "value4");
                dataStore1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataStore1, true);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                // Check that the document dirty state is cleaned after the ops are processed.
                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataStore1, false);
            });

            it("should clean document dirty state after batch and non-batch messages are flushed", async () => {
                // Send a non-batch message.
                dataStore1map1.set("key1", "value1");

                // Flush a couple of batches consecutively.
                dataStore1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataStore1map2.set("key2", "value2");
                dataStore1map1.set("key3", "value3");
                dataStore1map2.set("key4", "value4");
                (dataStore1.context.containerRuntime as IContainerRuntime).flush();

                dataStore1map1.set("key5", "value5");
                (dataStore1.context.containerRuntime as IContainerRuntime).flush();

                // Send another non-batch message.
                dataStore1map1.set("key5", "value5");

                // Set the FlushMode back to Automatic.
                dataStore1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataStore1, true);

                // Wait for the ops to get processed by both the containers.
                await opProcessingController.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataStore1, false);
            });
        });
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
