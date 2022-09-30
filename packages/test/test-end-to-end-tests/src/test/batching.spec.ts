/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
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
import { describeFullCompat, describeNoCompat } from "@fluidframework/test-version-utils";

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

// Function to yield a turn in the Javascript event loop.
async function yieldJSTurn(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve);
    });
}

function setupBatchMessageListener(dataStore: ITestFluidObject, receivedMessages: ISequencedDocumentMessage[]) {
    dataStore.context.containerRuntime.on("op", (message: ISequencedDocumentMessage, runtimeMessage?: boolean) => {
        if (runtimeMessage !== false) {
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

const filterDatastoreOps = (messages: ISequencedDocumentMessage[]) => {
    return messages.filter((m) => m.type === ContainerMessageType.FluidDataStoreOp);
};

async function waitForCleanContainers(...dataStores: ITestFluidObject[]) {
    return Promise.all(dataStores.map(async (dataStore) => {
        const runtime = dataStore.context.containerRuntime as IContainerRuntime;
        while (runtime.isDirty) {
            await timeoutPromise((resolve) => runtime.once("batchEnd", resolve));
        }
    }));
}

describeFullCompat("Flushing ops", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    let container1: Container;
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;
    let dataObject1map1: SharedMap;
    let dataObject1map2: SharedMap;
    let dataObject2map1: SharedMap;
    let dataObject2map2: SharedMap;

    beforeEach(async () => {
        // Create a Container for the first client.
        container1 = await provider.makeTestContainer(testContainerConfig) as Container;
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

    describe("Batch metadata verification when ops are flushed in batches", () => {
        let dataObject1BatchMessages: ISequencedDocumentMessage[] = [];
        let dataObject2BatchMessages: ISequencedDocumentMessage[] = [];

        beforeEach(() => {
            setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
            setupBatchMessageListener(dataObject2, dataObject2BatchMessages);
        });

        describe("Flushing of batches via orderSequentially", () => {
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

                assert.equal(filterDatastoreOps(dataObject1BatchMessages).length, 4,
                    "Incorrect number of messages received on local client");
                assert.equal(filterDatastoreOps(dataObject2BatchMessages).length, 4,
                    "Incorrect number of messages received on remote client");

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

                // Yield a turn so that in TurnBased mode, the ops are flushed.
                await yieldJSTurn();

                dataObject2.context.containerRuntime.orderSequentially(() => {
                    dataObject2map1.set("key3", "value3");
                    dataObject2map2.set("key4", "value4");
                });

                // Yield a turn so that in TurnBased mode, the ops are flushed.
                await yieldJSTurn();

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

                assert.equal(filterDatastoreOps(dataObject1BatchMessages).length, 4,
                    "Incorrect number of messages received on local client");
                assert.equal(filterDatastoreOps(dataObject2BatchMessages).length, 4,
                    "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages);
                verifyBatchMetadata(dataObject2BatchMessages);
            });
        });

        describe("TurnBased flushing of batches", () => {
            beforeEach(() => {
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
            });

            it("can send and receive multiple batch ops that are flushed on JS turn", async () => {
                // Send the ops that are to be batched together.
                dataObject1map1.set("key1", "value1");
                dataObject1map2.set("key2", "value2");
                dataObject1map1.set("key3", "value3");
                dataObject1map2.set("key4", "value4");

                // Yield a turn so that the ops are flushed.
                await yieldJSTurn();

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(filterDatastoreOps(dataObject1BatchMessages).length, 4,
                    "Incorrect number of messages received on local client");
                assert.equal(filterDatastoreOps(dataObject2BatchMessages).length, 4,
                    "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages);
                verifyBatchMetadata(dataObject2BatchMessages);
            });

            it("can send and receive single batch op that is flushed on JS turn", async () => {
                dataObject1map1.set("key1", "value1");

                // Yield a turn so that the op is flushed.
                await yieldJSTurn();

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(
                    dataObject1BatchMessages.length, 1, "Incorrect number of messages received on local client");
                assert.equal(
                    dataObject2BatchMessages.length, 1, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages);
                verifyBatchMetadata(dataObject2BatchMessages);
            });

            it("can send and receive consecutive batches that are flushed on JS turn", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling
                 * consecutive batches is correct.
                 */

                // Send the ops that are to be batched together.
                dataObject1map1.set("key1", "value1");
                dataObject1map2.set("key2", "value2");

                // wait for ops to be flushed.
                await provider.ensureSynchronized();

                // Send the second set of ops that are to be batched together.
                dataObject1map1.set("key3", "value3");
                dataObject1map2.set("key4", "value4");

                // wait for ops to be flushed.
                await provider.ensureSynchronized();

                // Send a third set of ops that are to be batched together.
                dataObject1map1.set("key5", "value5");
                dataObject1map2.set("key6", "value6");

                // Yield a turn so that the ops are flushed.
                await yieldJSTurn();

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

        describe("Immediate flushing of ops", () => {
            beforeEach(() => {
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
            });

            it("can send and receive ops that are flushed individually", async () => {
                dataObject1map1.set("key1", "value1");
                dataObject1map2.set("key2", "value2");

                // Wait for the ops to get processed by both the containers.
                await provider.ensureSynchronized();

                assert.equal(filterDatastoreOps(dataObject1BatchMessages).length, 2,
                    "Incorrect number of messages received on local client");
                assert.equal(filterDatastoreOps(dataObject2BatchMessages).length, 2,
                    "Incorrect number of messages received on remote client");

                verifyBatchMetadata(dataObject1BatchMessages.slice(0, 1));
                verifyBatchMetadata(dataObject1BatchMessages.slice(1, 2));
            });
        });

        afterEach(async () => {
            dataObject1BatchMessages = [];
            dataObject2BatchMessages = [];
        });
    });

    describe("Document Dirty State when batches are flushed", () => {
        // Verifies that the document dirty state for the given document is as expected.
        function verifyDocumentDirtyState(dataStore: ITestFluidObject, expectedState: boolean) {
            const dirty = (dataStore.context.containerRuntime as IContainerRuntime).isDirty;
            assert.equal(dirty, expectedState, "The document dirty state is not as expected");
        }

        describe("Automatic flushing of batches via orderSequentially", () => {
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

        describe("TurnBased flushing of batches", () => {
            beforeEach(() => {
                dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
            });

            it("should clean document dirty state after a batch with single message is flushed", async () => {
                dataObject1map1.set("key1", "value1");

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Yield a turn so that the ops are flushed.
                await yieldJSTurn();

                // Verify that the document dirty state is cleaned after the ops are processed.
                await provider.ensureSynchronized();
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after a batch with multiple messages is flushed", async () => {
                dataObject1map1.set("key1", "value1");
                dataObject1map2.set("key2", "value2");
                dataObject1map1.set("key3", "value3");

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Yield a turn so that the ops are flushed.
                await yieldJSTurn();

                // Verify that the document dirty state is cleaned after the ops are processed.
                await provider.ensureSynchronized();
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after consecutive batches are flushed", async () => {
                dataObject1map1.set("key1", "value1");

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Yield a turn so that the op is flushed.
                await yieldJSTurn();

                dataObject1map2.set("key2", "value2");
                dataObject1map1.set("key3", "value3");
                dataObject1map2.set("key4", "value4");

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Yield a turn so that the ops are flushed.
                await yieldJSTurn();

                // Check that the document dirty state is cleaned after the ops are processed.
                // Verify that the document dirty state is cleaned after the ops are processed.
                await provider.ensureSynchronized();
                verifyDocumentDirtyState(dataObject1, false);
            });

            it("should clean document dirty state after batch and non-batch messages are flushed", async () => {
                // Send a single message and yield a turn so that it is flushed.
                dataObject1map1.set("key1", "value1");
                await yieldJSTurn();

                // Flush a couple of batches consecutively and yield a turn so that they are flushed.
                dataObject1map2.set("key2", "value2");
                dataObject1map1.set("key3", "value3");
                dataObject1map2.set("key4", "value4");
                await yieldJSTurn();

                // Send a single message and yield a turn so that it is flushed.
                dataObject1map1.set("key5", "value5");
                await yieldJSTurn();

                // Send a single message.
                dataObject1map1.set("key5", "value5");

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(dataObject1, true);

                // Yield a turn so that the ops are flushed.
                await yieldJSTurn();

                // Verify that the document dirty state is cleaned after the ops are processed.
                await provider.ensureSynchronized();
                verifyDocumentDirtyState(dataObject1, false);
            });
        });
    });
});

describeNoCompat("Flushing ops in combination of TurnBased and Immediate", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let dataObject1: ITestFluidObject;
    let dataObject1map1: SharedMap;
    let dataObject1map2: SharedMap;
    let dataObject1BatchMessages: ISequencedDocumentMessage[] = [];

    beforeEach(async () => {
        provider = getTestObjectProvider();
        // Create a Container for the first client.
        const container1 = await provider.makeTestContainer(testContainerConfig) as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        dataObject1map1 = await dataObject1.getSharedObject<SharedMap>(map1Id);
        dataObject1map2 = await dataObject1.getSharedObject<SharedMap>(map2Id);

        await waitForCleanContainers(dataObject1);
        await provider.ensureSynchronized();
        setupBatchMessageListener(dataObject1, dataObject1BatchMessages);
    });

    it("can send ops alternatively with Immediate and TurnBased modes starting with Immediate", async () => {
        // Send couple of ops in Immediate FlushMode. These ops should not have batch metadata.
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1map1.set("key1", "value1");
        dataObject1map2.set("key2", "value2");

        // Send couple of ops in TurnBased FlushMode. These ops should be batched together. No need to yield
        // after sending these ops because setting FlushMode to Immediate will flush these ops.
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject1map1.set("key3", "value3");
        dataObject1map2.set("key4", "value4");

        // Send couple of ops in Immediate FlushMode. These ops should not have batch metadata.
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1map1.set("key5", "value5");
        dataObject1map2.set("key6", "value6");

        // Send couple of ops in TurnBased FlushMode. These ops should be batched together.
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject1map1.set("key3", "value3");
        dataObject1map2.set("key4", "value4");
        await yieldJSTurn();

        // Wait for the ops to get processed by both the containers.
        await provider.ensureSynchronized();

        assert.equal(
            dataObject1BatchMessages.length, 8, "Incorrect number of messages received on local client");

        // The first couple of ops in Immediate mode should have been sent individually without batch metadata.
        verifyBatchMetadata(dataObject1BatchMessages.slice(0, 1));
        verifyBatchMetadata(dataObject1BatchMessages.slice(1, 2));

        // The next couple of ops in TurnBased mode should be in a batch have have batch metadata.
        verifyBatchMetadata(dataObject1BatchMessages.slice(2, 4));

        // The next couple of ops in Immediate mode should have been sent individually without batch metadata.
        verifyBatchMetadata(dataObject1BatchMessages.slice(4, 5));
        verifyBatchMetadata(dataObject1BatchMessages.slice(5, 6));

        // The next couple of ops in TurnBased mode should be in a batch have have batch metadata.
        verifyBatchMetadata(dataObject1BatchMessages.slice(6, 8));
    });

    it("can send ops alternatively with Immediate and TurnBased modes starting with TurnBased", async () => {
        // Send couple of ops in TurnBased FlushMode. These ops should be batched together. No need to yield
        // after sending these ops because setting FlushMode to Immediate will flush these ops.
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject1map1.set("key1", "value1");
        dataObject1map2.set("key2", "value2");

        // Send couple of ops in Immediate FlushMode. These ops should not have batch metadata.
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1map1.set("key3", "value3");
        dataObject1map2.set("key4", "value4");

        // Send couple of ops in TurnBased FlushMode. These ops should be batched together. No need to yield
        // after sending these ops because setting FlushMode to Immediate will flush these ops.
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject1map1.set("key5", "value5");
        dataObject1map2.set("key6", "value6");

        // Send couple of ops in Immediate FlushMode. These ops should not have batch metadata.
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1map1.set("key3", "value3");
        dataObject1map2.set("key4", "value4");

        // Wait for the ops to get processed by both the containers.
        await provider.ensureSynchronized();

        assert.equal(
            dataObject1BatchMessages.length, 8, "Incorrect number of messages received on local client");

        // The first couple of ops in TurnBased mode should be in a batch have have batch metadata.
        verifyBatchMetadata(dataObject1BatchMessages.slice(0, 2));

        // The next couple of ops in Immediate mode should have been sent individually without batch metadata.
        verifyBatchMetadata(dataObject1BatchMessages.slice(2, 3));
        verifyBatchMetadata(dataObject1BatchMessages.slice(3, 4));

        // The next couple of ops in TurnBased mode should be in a batch have have batch metadata.
        verifyBatchMetadata(dataObject1BatchMessages.slice(4, 6));

        // The next couple of ops in Immediate mode should have been sent individually without batch metadata.
        verifyBatchMetadata(dataObject1BatchMessages.slice(6, 7));
        verifyBatchMetadata(dataObject1BatchMessages.slice(7, 8));
    });

    afterEach(() => {
        dataObject1BatchMessages = [];
    });
});
