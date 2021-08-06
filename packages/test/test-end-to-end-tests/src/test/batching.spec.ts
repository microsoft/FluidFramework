/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ChannelFactoryRegistry,
    timeoutPromise,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import {
    describeFullCompat,
} from "@fluidframework/test-version-utils";

const map1Id = "map1Key";
const map2Id = "map2Key";
const registry: ChannelFactoryRegistry = [
    [map1Id, SharedMap.getFactory()],
    [map2Id, SharedMap.getFactory()],
];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

describeFullCompat("Batching", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;
    let dataObject1map1: SharedMap;
    let dataObject1map2: SharedMap;
    let dataObject2map1: SharedMap;
    let dataObject2map2: SharedMap;

    function setupBatchMessageListener(dataStore: ITestFluidObject, receivedMessages: ISequencedDocumentMessage[]) {
        dataStore.context.containerRuntime.on("op", (message: ISequencedDocumentMessage) => {
            if (message.type === ContainerMessageType.FluidDataStoreOp) {
                receivedMessages.push(message);
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

    // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
    async function waitForCleanContainers(...dataStores: ITestFluidObject[]) {
        return Promise.all(dataStores.map(async (dataStore) => {
            const runtime = dataStore.context.containerRuntime as IContainerRuntime;
            while (runtime.isDirty) {
                await timeoutPromise((resolve) => runtime.once("batchEnd", resolve));
            }
        }));
    }

    beforeEach(async () => {
        // Create a Container for the first client.
        const container1 = await provider.makeTestContainer(testContainerConfig);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        dataObject1map1 = await dataObject1.getSharedObject<SharedMap>(map1Id);
        dataObject1map2 = await dataObject1.getSharedObject<SharedMap>(map2Id);

        // Load the Container that was created by the first client.
        const container2 = await provider.loadTestContainer(testContainerConfig);
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        dataObject2map1 = await dataObject2.getSharedObject<SharedMap>(map1Id);
        dataObject2map2 = await dataObject2.getSharedObject<SharedMap>(map2Id);

        await waitForCleanContainers(dataObject1, dataObject2);
        await provider.ensureSynchronized();
    });

    describe("Local ops batch metadata verification", () => {
        let dataObject1BatchMessages: ISequencedDocumentMessage[] = [];
        let dataObject2BatchMessages: ISequencedDocumentMessage[] = [];

        beforeEach(() => {
            setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
            setupBatchMessageListener(dataObject2, dataObject2BatchMessages);
        });

        describe("Automatic batches via orderSequentially", () => {
            it("can send and receive multiple batch ops correctly", async () => {
                // Send messages in batch in the first dataStore.
                dataObject1.context.containerRuntime.orderSequentially(() => {
                    dataObject1map1.set("key1", "value1");
                    dataObject1map2.set("key2", "value2");
                    dataObject1map1.set("key3", "value3");
                    dataObject1map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages);
                verifyBatchMetadata(dataObject2BatchMessages);
            });

            it("can send and receive single batch op correctly", async () => {
                dataObject2.context.containerRuntime.orderSequentially(() => {
                    dataObject2map1.set("key1", "value1");
                });

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 1, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 1, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages);
                verifyBatchMetadata(dataObject2BatchMessages);
            });

            it("can send and receive consecutive batches correctly", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling
                 * consecutive batches is correct.
                 */
                dataObject2.context.containerRuntime.orderSequentially(() => {
                    dataObject2map1.set("key1", "value1");
                    dataObject2map2.set("key2", "value2");
                });

                dataObject2.context.containerRuntime.orderSequentially(() => {
                    dataObject2map1.set("key3", "value3");
                    dataObject2map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                // Verify the local client's batches.
                verifyBatchMetadata(dataObject1BatchMessages.slice(0, 2));
                verifyBatchMetadata(dataObject1BatchMessages.slice(2, 4));

                // Verify the remote client's batches.
                verifyBatchMetadata(dataObject2BatchMessages.slice(0, 2));
                verifyBatchMetadata(dataObject2BatchMessages.slice(2, 4));
            });

            it("can handle calls to orderSequentially with no batch messages", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling batches
                 * with no messages is correct.
                 */
                dataObject1.context.containerRuntime.orderSequentially(() => {
                });

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 0, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 0, "Incorrect number of messages received on remote client");
            });

            it("can handle nested orderSequentially by ignoring inner calls to it", async () => {
                // If orderSequentially is nested, only the outermost is considered as the beginning and end of the
                // batch. The inner ones are ignored.
                dataObject1.context.containerRuntime.orderSequentially(() => {
                    dataObject1map1.set("key1", "value1");
                    // Level 1 nesting.
                    dataObject1.context.containerRuntime.orderSequentially(() => {
                        dataObject1map2.set("key2", "value2");
                        // Level 2 nesting.
                        dataObject1.context.containerRuntime.orderSequentially(() => {
                            dataObject1map1.set("key3", "value3");
                        });
                    });
                    dataObject1map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages);
                verifyBatchMetadata(dataObject2BatchMessages);
            });
        });

        describe("Manually flushed batches", () => {
            it("can send and receive multiple batch ops that are manually flushed", async () => {
                // Set the FlushMode to Manual.
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Manual);

                // Send the ops that are to be batched together.
                dataObject1map1.set("key1", "value1");
                dataObject1map2.set("key2", "value2");
                dataObject1map1.set("key3", "value3");
                dataObject1map2.set("key4", "value4");

                // Manually flush the batch.
                (dataObject1.context.containerRuntime as IContainerRuntime).flush();

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages);
                verifyBatchMetadata(dataObject2BatchMessages);
            });

            it("can send and receive single batch op that is manually flushed", async () => {
                // Manually flush a single message as a batch.
                dataObject2.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataObject2map1.set("key1", "value1");
                (dataObject2.context.containerRuntime as IContainerRuntime).flush();

                // Set the FlushMode back to Immediate.
                dataObject2.context.containerRuntime.setFlushMode(FlushMode.Immediate);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 1, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 1, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages);
                verifyBatchMetadata(dataObject2BatchMessages);
            });

            it("can send and receive consecutive batches that are manually flushed", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling
                 * consecutive batches is correct.
                 */

                // Set the FlushMode to Manual.
                dataObject2.context.containerRuntime.setFlushMode(FlushMode.Manual);

                // Send the ops that are to be batched together.
                dataObject2map1.set("key1", "value1");
                dataObject2map2.set("key2", "value2");

                // Manually flush the batch.
                (dataObject2.context.containerRuntime as IContainerRuntime).flush();

                // Send the second set of ops that are to be batched together.
                dataObject2map1.set("key3", "value3");
                dataObject2map2.set("key4", "value4");

                // Manually flush the batch.
                (dataObject2.context.containerRuntime as IContainerRuntime).flush();

                // Send a third set of ops that are to be batched together.
                dataObject2map1.set("key5", "value5");
                dataObject2map2.set("key6", "value6");

                // Manually flush the batch.
                (dataObject2.context.containerRuntime as IContainerRuntime).flush();

                // Set the FlushMode back to Immediate.
                dataObject2.context.containerRuntime.setFlushMode(FlushMode.Immediate);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 6, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 6, "Incorrect number of messages received on remote client");

                // Verify the local client's batches.
                verifyBatchMetadata(dataObject1BatchMessages.slice(0, 2));
                verifyBatchMetadata(dataObject1BatchMessages.slice(2, 4));
                verifyBatchMetadata(dataObject1BatchMessages.slice(4, 6));

                // Verify the remote client's batches.
                verifyBatchMetadata(dataObject2BatchMessages.slice(0, 2));
                verifyBatchMetadata(dataObject2BatchMessages.slice(2, 4));
                verifyBatchMetadata(dataObject2BatchMessages.slice(4, 6));
            });
        });

        afterEach(async () => {
            dataObject1BatchMessages = [];
            dataObject2BatchMessages = [];
        });
    });

    describe("Document Dirty State", () => {
        // Verifies that the document dirty state for the given document is as expected.
        function verifyDocumentDirtyState(dataStore: ITestFluidObject, expectedState: boolean) {
            let dirty = (dataStore.context.containerRuntime as IContainerRuntime).isDirty;
            // back-compat: 0.35: remove in future versions
            if (dirty === undefined) {
                dirty = (dataStore.context.containerRuntime as IContainerRuntime).isDocumentDirty();
            }
            assert.equal(dirty, expectedState, "The document dirty state is not as expected");
        }

        describe("Automatic batches via orderSequentially", () => {
            it("should clean document dirty state after a batch with single message is sent", async () => {
                // Send a batch with a single message.
                dataObject1.context.containerRuntime.orderSequentially(() => {
                    dataObject1map1.set("key1", "value1");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after a batch with multiple messages is sent", async () => {
                // Send a batch with multiple messages.
                dataObject1.context.containerRuntime.orderSequentially(() => {
                    dataObject1map1.set("key1", "value1");
                    dataObject1map2.set("key2", "value2");
                    dataObject1map1.set("key3", "value3");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after consecutive batches are sent", async () => {
                // Send a couple of batches consecutively.
                dataObject1.context.containerRuntime.orderSequentially(() => {
                    dataObject1map1.set("key1", "value1");
                });

                dataObject1.context.containerRuntime.orderSequentially(() => {
                    dataObject1map2.set("key2", "value2");
                    dataObject1map1.set("key3", "value3");
                    dataObject1map2.set("key4", "value4");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                // Check that the document dirty state is cleaned after the ops are processed.
                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after batch and non-batch messages are sent", async () => {
                // Send a non-batch message.
                dataObject1map1.set("key1", "value1");

                // Send a couple of batches consecutively.
                dataObject1.context.containerRuntime.orderSequentially(() => {
                    dataObject1map2.set("key2", "value2");
                    dataObject1map1.set("key3", "value3");
                    dataObject1map2.set("key4", "value4");
                });

                dataObject1.context.containerRuntime.orderSequentially(() => {
                    dataObject1map1.set("key5", "value5");
                });

                // Send another non-batch message.
                dataObject1map1.set("key5", "value5");

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataObject1, false);
            });
        });

        describe("Manually flushed batches", () => {
            it("should clean document dirty state after a batch with single message is flushed", async () => {
                // Manually flush a single batch message.
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataObject1map1.set("key1", "value1");
                (dataObject1.context.containerRuntime as IContainerRuntime).flush();

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after a batch with multiple messages is flushed", async () => {
                // Manually flush a batch with multiple messages.
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataObject1map1.set("key1", "value1");
                dataObject1map2.set("key2", "value2");
                dataObject1map1.set("key3", "value3");
                (dataObject1.context.containerRuntime as IContainerRuntime).flush();
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after consecutive batches are flushed", async () => {
                // Flush a couple of batches consecutively.
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataObject1map1.set("key1", "value1");
                (dataObject1.context.containerRuntime as IContainerRuntime).flush();

                dataObject1map2.set("key2", "value2");
                dataObject1map1.set("key3", "value3");
                dataObject1map2.set("key4", "value4");
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                // Check that the document dirty state is cleaned after the ops are processed.
                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after batch and non-batch messages are flushed", async () => {
                // Send a non-batch message.
                dataObject1map1.set("key1", "value1");

                // Flush a couple of batches consecutively.
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                dataObject1map2.set("key2", "value2");
                dataObject1map1.set("key3", "value3");
                dataObject1map2.set("key4", "value4");
                (dataObject1.context.containerRuntime as IContainerRuntime).flush();

                dataObject1map1.set("key5", "value5");
                (dataObject1.context.containerRuntime as IContainerRuntime).flush();

                // Send another non-batch message.
                dataObject1map1.set("key5", "value5");

                // Set the FlushMode back to Immediate.
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(dataObject1, false);
            });
        });
    });
});
